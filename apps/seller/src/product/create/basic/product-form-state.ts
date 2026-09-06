import { fenToYuan } from "@shop/api"
import type { SkuResponse, SkuStatus } from "@shop/api/sdk"

import type { SpecSelection } from "../../data"

export { buildSkuRowsFromSelections } from "./sku-combinator"

/**
 * 发布流程「可持久化的客户端值」的类型与纯转换函数。
 *
 * 这里只定义「用户填了什么」（basic 表单字段 / selections 销售属性选值 / skuRows SKU 行值），
 * 不含任何请求副作用。草稿回填（GET/{id} → hydrate）、保存落库、选值级联生成 SKU
 * 这些副作用都交给 use-product-draft.ts（其 reducer 内联在 hook 内），本文件保持纯函数。
 *
 * 值按后端三个更新入口切块，回填/保存一一对应：
 *   basic       → PUT /{id}        (updateProduct)
 *   selections  → PUT /{id}/specs  (applyProductSpecs)
 *   skuRows     → PUT /{id}/skus   (updateProductSkus)
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

/** 销售属性选值（对应 UpdateSpecsRequest.specs）：形状单一来源是 ../data.ts 的 SpecSelection（派生自 SDK），此处只起个复数别名 */
export type SpecSelections = SpecSelection[]

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
    status: SkuStatus
}

// ---------- 纯转换/合并函数 ----------

/** 服务端 SKU → 可编辑行（价格分→元、库存补 0、label 拼规格名）。*/
export function rowFromSku(sku: SkuResponse): SkuDraftRow {
    return {
        skuId: sku.id,
        label: sku.attributes.map((a) => a.value).join(" / ") || "单规格",
        priceText: sku.price == undefined ? "" : fenToYuan(sku.price),
        stockText: String(sku.stock),
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
