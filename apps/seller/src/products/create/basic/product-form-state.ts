import { fenToYuan } from "@shop/api"
import type { SkuResponse } from "@shop/api/sdk"

import type { CategoryAttrTemplateNode, SpecSelection } from "../../data"

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

/**
 * 上架时间：决定「提交商品信息」落哪个状态。
 *  - now      立即上架 → 发布后即 PUBLISHED
 *  - warehouse 放入仓库 → 落 WAREHOUSE（暂未开工，见后端 target 支撑）
 * 定时上架（scheduled）本轮不做。
 */
export type ListingTime = "now" | "warehouse"

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

// ---------- 前端本地 SKU 组合（完全显式：不调后端、不建档，仅凭模板 + 选值算出组合行供编辑） ----------

/** 一个维度的取值集合：值文本 + 是否自定义（自定义无 valueId，留待保存时后端 auto 建档） */
interface SpecValueDraft {
    valueId?: string
    value: string
}

/** 按模板维度顺序解析选择 → 各维度取值数组；自定义值文本无 valueId */
function resolveDimensionValues(
    template: CategoryAttrTemplateNode[],
    selections: SpecSelection[],
): SpecValueDraft[][] {
    return template.map((node) => {
        const sel = selections.find((s) => s.attrId === node.attr.id)
        if (!sel) return []
        // 模板值（valueId）→ 文本
        const fromValueIds = (sel.valueIds ?? [])
            .map((vid) => {
                const v = node.values.find((x) => x.id === vid)
                return v ? ({ valueId: v.id, value: v.value } as SpecValueDraft) : undefined
            })
            .filter((x): x is SpecValueDraft => Boolean(x))
        // 自定义值（无 valueId）
        const fromCustom = (sel.customValues ?? [])
            .map((cv) => cv.trim())
            .filter((cv) => Boolean(cv))
            .map((cv) => ({ value: cv }) as SpecValueDraft)
        return [...fromValueIds, ...fromCustom]
    })
}

/** 各维度取值做笛卡尔积：返回全部组合（每组合是「维度下标 → 取值」的数组） */
function cartesianValues(dimensions: SpecValueDraft[][]): SpecValueDraft[][] {
    let result: SpecValueDraft[][] = [[]]
    for (const dim of dimensions) {
        // 空维度（未选）→ 单规格：跳过，组合数不变（对齐后端 cartesian：specs 空 → [[]]）
        if (dim.length === 0) continue
        const next: SpecValueDraft[][] = []
        for (const prefix of result) {
            for (const v of dim) {
                next.push([...prefix, v])
            }
        }
        result = next
    }
    return result
}

/**
 * 前端按「模板 + 选值」本地算出 SKU 组合行（完全显式模式：不调后端、不建档）。
 *
 * - 无任何选值 → 单规格 1 行（label=「单规格」，spu 名可能为空故不用 spu 拼接）
 * - 有选值 → 各维度取值笛卡尔积，label 用取值文本「 / 」拼接
 * - skuId：新建态无（留空，保存时后端回填）；编辑态由调用方按组合匹配带回
 * - 价格/库存/编码/状态初始为空/0/默认，用户填了再保存
 */
export function buildSkuRowsFromSelections(
    template: CategoryAttrTemplateNode[],
    selections: SpecSelection[],
): SkuDraftRow[] {
    const dimensions = resolveDimensionValues(template, selections)
    const hasSelection = dimensions.some((d) => d.length > 0)
    if (!hasSelection) {
        return [
            {
                skuId: "",
                label: "单规格",
                priceText: "",
                stockText: "",
                skuCode: "",
                status: "ON_SALE",
            },
        ]
    }
    return cartesianValues(dimensions).map((combo) => ({
        skuId: "",
        label: combo.map((v) => v.value).join(" / ") || "单规格",
        priceText: "",
        stockText: "",
        skuCode: "",
        status: "ON_SALE",
    }))
}

/**
 * 保存时把「本地组合行已填的价格/库存/编码」按组合值 merge 到「后端生成的带 skuId 行」上。
 *
 * 新建态本地行 skuId 为空，无法按 id 匹配；但组合 label（取值文本「 / 」拼接）与后端行
 * rowFromSku 的 label 同构，故按 label 匹配搬回已填值。后端新行 skuId 为空（未设价）时仍用后端值。
 */
export function mergeLocalPricedRows(
    local: SkuDraftRow[],
    serverRows: SkuDraftRow[],
): SkuDraftRow[] {
    const localByLabel = new Map(local.map((r) => [r.label, r]))
    return serverRows.map((serverRow) => {
        const draft = localByLabel.get(serverRow.label)
        if (!draft) return serverRow
        return {
            ...serverRow,
            priceText: draft.priceText || serverRow.priceText,
            stockText: draft.stockText || serverRow.stockText,
            skuCode: draft.skuCode || serverRow.skuCode,
            status: draft.status,
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
