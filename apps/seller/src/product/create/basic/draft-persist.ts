import { ProductsAdminApi, type ProductStatus } from "@shop/api/sdk"

import { publishGateError, willPublish, type SaveMode } from "#/product/edit-rules"
import {
    mergeLocalPricedRows,
    rowFromSku,
    toBasicPayload,
    toSkuUpdateItems,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelection,
} from "#/product/draft-model"

/**
 * 「显式保存」模式的落库编排：建档 → basic → 规格 → 门槛 → 已设价 SKU → 发布。
 *
 * 从 `useProductDraft` 里搬出来的原因：这一整条编排只依赖「显式传进来的值 + 两个 ref」，
 * 不依赖 React 状态本身，留在 hook 里只会把 hook 的认知复杂度顶高。搬出来后每个步骤是一个
 * 独立的语义化函数，依赖全在参数上——既降复杂度，也让编排本身能被单独读懂。
 *
 * 不变的是**发请求的时机与顺序**（见 use-product-draft.test.tsx 的接线测试）：
 * 新建态的编辑过程仍然零写库，只有 submit 才走这里。
 */

/**
 * 本模块主动拒绝的业务错误：形状对齐 ApiError（调用方 toApiError / notify.fromError 直接读 detail）。
 *
 * `status` 取 400 而不是 0：那条链上 0 的含义是「没听到后端说话」（i18n.md §7.3 第 2 支），
 * 借它会让这句本地写的具体原因被通用网络提示顶掉；400 才是它本来的意思——这一发请求不该发出去。
 */
export class BusinessError {
    readonly status = 400
    readonly detail: string
    constructor(detail: string) {
        this.detail = detail
    }
}

/** 建档落库要写进请求体的上下文 + 落库后要回写的副作用（全用回调，模块内不碰 React） */
export type DraftPersistContext = {
    shopId?: string
    categoryId?: string
    /** 编辑已有商品时的状态（新建为 undefined）：决定门槛与是否发布 */
    productStatus: ProductStatus | undefined
    /** 已建档的商品 id：建档后写回（编辑态进入即有） */
    productRef: { current: string | undefined }
    /** 本会话内点保存创建（非续编）：建档成功后回调置位（渲染期要靠它关掉详情查询与回填） */
    markCreatedInSession: () => void
    /** 规格快照 ref：await 期间可能被改，落库要拿最新的 */
    selectionsRef: { current: SpecSelection[] }
    /** SKU 行快照 ref：落库与门槛都读它 */
    skuRowsRef: { current: SkuDraftRow[] }
    /** 建档成功后把 id 写回 URL（刷新可恢复） */
    onCreated: (productId: string) => void
    /** 建档进行中标记的 setter（驱动按钮 loading） */
    setCreating: (creating: boolean) => void
    /** 规格对账后把新行写回受控值 */
    setSkuRows: (rows: SkuDraftRow[]) => void
}

/** 建档（幂等）：只在保存/提交时创建。已有 id 直接复用（编辑态/本会话已建档）。 */
async function ensureDraft(ctx: DraftPersistContext, basic: ProductBasicForm): Promise<string> {
    if (ctx.productRef.current) return ctx.productRef.current
    if (!ctx.shopId || !ctx.categoryId) throw new BusinessError("请先选择店铺和类目")
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

/** 落 basic（标题/图片/卖点）——草稿与提交都存，保证下次进来能完整续编。 */
function persistBasic(id: string, categoryId: string, basic: ProductBasicForm): Promise<unknown> {
    return ProductsAdminApi.updateProduct({
        path: { id },
        body: toBasicPayload(categoryId, basic),
    })
}

/** 落 specs 拿真实 skuId（无选值→单规格隐藏 SKU；有选值→对账生成网格；编辑态幂等）。
 *  草稿与提交都做：把当前已配置的规格/组合持久化下来，保证下次进来能完整续编。
 *  草稿无门槛：规格落库失败（如某维度未选值）时降级跳过规格，仍存 basic；提交模式保持严格（失败抛错让用户看到）。 */
async function persistSpecs(ctx: DraftPersistContext, id: string, mode: SaveMode): Promise<void> {
    try {
        const fresh = await ProductsAdminApi.updateProductSpecs({
            path: { id },
            body: { specs: ctx.selectionsRef.current },
        })
        // 把本地已填的价格/库存/编码按「组合值」搬到后端行上（本地行 skuId 空，不能按 id 匹配）
        const withDraft = mergeLocalPricedRows(ctx.skuRowsRef.current, fresh.map(rowFromSku))
        ctx.setSkuRows(withDraft)
        ctx.skuRowsRef.current = withDraft
    } catch (error) {
        if (mode !== "draft") throw error
        // 草稿：规格落不了就先跳过，basic 已存，下次可再补
    }
}

/** 只回传「已设价且已建档」的 SKU 行落库；空价 SKU 不发（草稿无门槛的关键：没设价的 SKU 不写 0）。 */
async function persistPricedSkus(ctx: DraftPersistContext, id: string): Promise<void> {
    const priced = toSkuUpdateItems(ctx.skuRowsRef.current)
    if (priced.length > 0) {
        await ProductsAdminApi.updateProductSkus({ path: { id }, body: { items: priced } })
    }
}

/**
 * 保存/发布的编排（显式保存唯一落库入口）。草稿=完整持久化但不发布（无门槛），提交=完整+发布。
 * 每一步是一个语义化小函数，各自携带「为什么」；主流程只读意图不读实现。
 */
export async function saveAndPublish(
    ctx: DraftPersistContext,
    basic: ProductBasicForm,
    mode: SaveMode,
): Promise<void> {
    // 没店就没得存：静默返回会让按钮看着像没反应，交给页内横幅说清楚
    if (!ctx.shopId) throw new BusinessError("请先选择店铺")
    // 1. 建档（首次才 POST；编辑态复用）——拿到可落库的 productId（草稿/提交都需先有商品）
    const id = await ensureDraft(ctx, basic)
    // 2. 落 basic（标题/图片/卖点）——草稿与提交都存
    await persistBasic(id, ctx.categoryId!, basic)
    // 3. 落规格拿真实 skuId + 本地已填价搬回（草稿降级跳过，提交严格）
    await persistSpecs(ctx, id, mode)
    // 4. 门槛绑定「动作目标」而非「商品状态」（保存≠发布，后端 ensurePublishable 仍兜底 409）
    const gate = publishGateError(ctx.skuRowsRef.current, mode, ctx.productStatus)
    if (gate) throw new BusinessError(gate)
    // 5. 只回传「已设价」的 SKU（净空价不发——草稿无门槛的关键：没设价的 SKU 不写 0，留着下次补）
    await persistPricedSkus(ctx, id)
    // 6. 发布：仅「本次操作会发布」（新建/草稿会话点提交/入库）才 publish；仓库/上架会话保存变更不回退状态
    if (willPublish(mode, ctx.productStatus)) {
        await ProductsAdminApi.publishProduct({
            path: { id },
            query: { target: mode === "warehouse" ? "WAREHOUSE" : "PUBLISHED" },
        })
    }
}
