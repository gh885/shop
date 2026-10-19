import { ProductsAdminApi, type ProductStatus } from "@shop/api/sdk"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

import { publishGateError, willPublish, type SaveMode } from "#/product/edit-rules"
import { GATE_ERROR_KEY } from "#/product/constants"
import {
    mergeLocalPricedRows,
    rowFromSku,
    toBasicPayload,
    toSkuUpdateItems,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelection,
} from "#/product/draft-rules"

// 本模块主动拒绝的业务错误：带的是 catalog key（status 400 对齐 ApiError 让全局链认得出、走 isApiError 静默不重复弹 toast）；detail 故意放 key 而非句子，漏到界面也是一串可 grep 的键名；句子由渲染边界按 locale t 出
export class BusinessError {
    // fallow-ignore-next-line unused-class-member -- toApiError 走 "status" in err 鸭子类型读它，静态图看不见
    readonly status = 400
    readonly key: Exclude<SellerMessageKey, keyof SellerParamsByKey>
    readonly detail: string
    constructor(key: Exclude<SellerMessageKey, keyof SellerParamsByKey>) {
        this.key = key
        this.detail = key
    }
}

export type DraftPersistContext = {
    shopId?: string
    categoryId?: string
    productStatus: ProductStatus | undefined
    productRef: { current: string | undefined }
    markCreatedInSession: () => void
    // 快照 ref：await 期间受控值可能被改，落库/门槛都读最新的那份
    selectionsRef: { current: SpecSelection[] }
    skuRowsRef: { current: SkuDraftRow[] }
    onCreated: (productId: string) => void
    setCreating: (creating: boolean) => void
    setSkuRows: (rows: SkuDraftRow[]) => void
}

async function ensureDraft(ctx: DraftPersistContext, basic: ProductBasicForm): Promise<string> {
    if (ctx.productRef.current) return ctx.productRef.current
    if (!ctx.shopId || !ctx.categoryId)
        throw new BusinessError("product.gate.error.needShopAndCategory")
    ctx.setCreating(true)
    // 不用 try/finally（React Compiler 暂不支持 finally 块）：成功/失败路径各自复位 creating
    try {
        const product = await ProductsAdminApi.createProduct({
            body: toBasicPayload(ctx.categoryId, basic),
        })
        ctx.productRef.current = product.id
        ctx.markCreatedInSession()
        ctx.onCreated(product.id)
        ctx.setCreating(false)
        return product.id
    } catch (error) {
        ctx.setCreating(false)
        throw error
    }
}

function persistBasic(id: string, categoryId: string, basic: ProductBasicForm): Promise<unknown> {
    return ProductsAdminApi.updateProduct({
        path: { id },
        body: toBasicPayload(categoryId, basic),
    })
}

// 落 specs 拿真实 skuId：草稿无门槛——规格落库失败时降级跳过、basic 仍存；提交保持严格（失败抛错让用户看到）
async function persistSpecs(ctx: DraftPersistContext, id: string, mode: SaveMode): Promise<void> {
    try {
        const fresh = await ProductsAdminApi.updateProductSpecs({
            path: { id },
            body: { specs: ctx.selectionsRef.current },
        })
        const withDraft = mergeLocalPricedRows(ctx.skuRowsRef.current, fresh.map(rowFromSku))
        ctx.setSkuRows(withDraft)
        ctx.skuRowsRef.current = withDraft
    } catch (error) {
        if (mode !== "draft") throw error
        // 草稿：规格落不了就先跳过，basic 已存，下次可再补
    }
}

async function persistPricedSkus(ctx: DraftPersistContext, id: string): Promise<void> {
    const priced = toSkuUpdateItems(ctx.skuRowsRef.current)
    if (priced.length > 0) {
        await ProductsAdminApi.updateProductSkus({ path: { id }, body: { items: priced } })
    }
}

// 显式保存的唯一落库入口：建档→basic→规格→门槛→已设价 SKU→发布；顺序不可乱（见 use-product-draft.test.tsx 接线测试），新建态编辑过程零写库只有 submit 走这里
export async function saveAndPublish(
    ctx: DraftPersistContext,
    basic: ProductBasicForm,
    mode: SaveMode,
): Promise<void> {
    if (!ctx.shopId) throw new BusinessError("product.gate.error.needShop")
    const id = await ensureDraft(ctx, basic)
    await persistBasic(id, ctx.categoryId!, basic)
    await persistSpecs(ctx, id, mode)
    // 门槛绑定「动作目标」而非「商品状态」（保存≠发布，后端 ensurePublishable 仍兜底 409）；fact → key 走 constants 表，句子仍由渲染边界 t(key) 出
    const gate = publishGateError(ctx.skuRowsRef.current, mode, ctx.productStatus)
    if (gate) throw new BusinessError(GATE_ERROR_KEY[gate])
    await persistPricedSkus(ctx, id)
    if (willPublish(mode, ctx.productStatus)) {
        await ProductsAdminApi.publishProduct({
            path: { id },
            query: { target: mode === "warehouse" ? "WAREHOUSE" : "PUBLISHED" },
        })
    }
}
