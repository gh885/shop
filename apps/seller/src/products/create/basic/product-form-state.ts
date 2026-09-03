import { fenToYuan } from "@shop/api"
import type { SkuResponse } from "@shop/api/sdk"

/**
 * 发布流程「可持久化的客户端值」—— useReducer 的唯一真相源。
 *
 * 这里只定义「用户填了什么」（basic 表单字段 / selections 销售属性选值 / skuRows SKU 行值），
 * 不含任何请求副作用。草稿回填（GET/{id} → hydrate）、autosave（防抖 PUT）、选值级联生成 SKU
 * 这些副作用都交给 use-product-draft.ts，本文件保持纯函数。
 *
 * 值按后端三个更新入口切块，回填/autosave 一一对应：
 *   basic       → PUT /{id}        (updateBasic)
 *   selections  → PUT /{id}/specs  (updateSpecs)
 *   skuRows     → PUT /{id}/skus   (updateSkus)
 */

// ---------- 值类型 ----------

/** 表单字段值（对应后端 UpdateProductRequest = 商品基本信息） */
export interface ProductBasicForm {
    images: string[]
    name: string
    subtitle: string
    /** 详情图流 */
    detailImages: string[]
}

/** 销售属性选值（对应 UpdateSpecsRequest.specs） */
export type SpecSelections = { attrId: string; valueIds: string[]; customValues: string[] }[]

/** SKU 网格行值（对应 UpdateSkusRequest.items）+ label 展示快照 */
export interface SkuDraftRow {
    /** SKU 主键：服务端生成，组合没变的 SKU 复用同一 id（稳定键，用于匹配/回填已填价格） */
    skuId: string
    /** 规格组合显示名，SKU 生成时快照 */
    label: string
    /** 用户输入的单价（元字符串，空=未填） */
    priceText: string
    /** 用户输入的库存（件字符串，空=未填） */
    stockText: string
    skuCode: string
    status: "ON_SALE" | "DISABLED"
}

/** 整个可持久化值的快照 */
export interface ProductDraftState {
    basic: ProductBasicForm
    selections: SpecSelections
    skuRows: SkuDraftRow[]
}

// ---------- 纯转换/合并函数 ----------

/** 服务端 SKU → 可编辑行（价格分→元、库存补 0、label 拼规格名）。*/
export function rowFromSku(sku: SkuResponse): SkuDraftRow {
    return {
        skuId: sku.id,
        label: (sku.attributes ?? []).map((a) => a.value).join(" / ") || "单规格",
        priceText: sku.price == undefined ? "" : fenToYuan(sku.price),
        stockText: sku.stock == undefined ? "" : String(sku.stock),
        skuCode: sku.skuCode ?? "",
        status: sku.status === "DISABLED" ? "DISABLED" : "ON_SALE",
    }
}

/**
 * 选值变化 → 服务端重新生成 SKU → 用新网格替换，但**保留未变 SKU 已填的价格/库存/编码**。
 * 后端 updateSpecs 对「组合没变的 SKU」复用同一 id（稳定键），故按 skuId 匹配即可带回旧值。
 */
export function mergeSkuRows(
    previous: SkuDraftRow[] | undefined,
    fresh: SkuResponse[],
): SkuDraftRow[] {
    // 按 skuId 索引上一轮的值（只有用户填过的才值得带回）
    const prevById = new Map((previous ?? []).map((r) => [r.skuId, r] as const))
    return fresh.map((sku) => {
        const row = rowFromSku(sku)
        const prev = prevById.get(row.skuId)
        if (!prev) return row
        // 保留已填字段（未填的仍用服务端回填值）
        return {
            ...row,
            priceText: prev.priceText || row.priceText,
            stockText: prev.stockText || row.stockText,
            skuCode: prev.skuCode || row.skuCode,
        }
    })
}

// ---------- reducer ----------

export function emptyProductDraft(): ProductDraftState {
    return {
        basic: { images: [], name: "", subtitle: "", detailImages: [] },
        selections: [],
        skuRows: [],
    }
}

export type ProductDraftAction =
    | { type: "hydrate"; draft: ProductDraftState } // 草稿 GET/{id} 整体回填
    | { type: "setBasic"; patch: Partial<ProductBasicForm> } // 表单字段改
    | { type: "setSelections"; selections: SpecSelections } // 销售属性选值变
    | { type: "setSkuRows"; rows: SkuDraftRow[] } // SKU 网格值变

export function productDraftReducer(
    state: ProductDraftState,
    action: ProductDraftAction,
): ProductDraftState {
    switch (action.type) {
        case "hydrate":
            return action.draft
        case "setBasic":
            return { ...state, basic: { ...state.basic, ...action.patch } }
        case "setSelections":
            return { ...state, selections: action.selections }
        case "setSkuRows":
            return { ...state, skuRows: action.rows }
    }
}
