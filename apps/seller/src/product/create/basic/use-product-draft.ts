import {
    CategoriesApi,
    ProductsAdminApi,
    type CategoryAttrNodeResponse,
    type ProductStatus,
} from "@shop/api/sdk"
import { useEffect, useReducer, useRef, useState } from "react"

import { publishGateError, willPublish, type SaveMode } from "#/product/edit-rules"
import { notify } from "@shop/app-kit"
import {
    buildSkuRowsFromSelections,
    mergeLocalPricedRows,
    mergeSkuRows,
    rowFromSku,
    toBasicPayload,
    toSkuUpdateItems,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelection,
} from "#/product/draft-model"

/** 本 hook 主动拒绝的业务错误：形状对齐 ApiError（调用方 toApiError / notify.fromError 直接读 detail） */
class BusinessError {
    readonly status = 0
    readonly detail: string
    constructor(detail: string) {
        this.detail = detail
    }
}

/** 本 hook 受控值快照（basic 由调用方 useAppForm 持有，不入此 reducer） */
type DraftState = { selections: SpecSelection[]; skuRows: SkuDraftRow[] }
type DraftAction =
    | { type: "hydrate"; selections: SpecSelection[]; skuRows: SkuDraftRow[] }
    | { type: "setSelections"; selections: SpecSelection[] }
    | { type: "setSkuRows"; rows: SkuDraftRow[] }
const DRAFT_INITIAL: DraftState = { selections: [], skuRows: [] }

/** 草稿值 reducer（纯函数）：hydration 覆盖、选值/行各自替换。 */
function draftReducer(state: DraftState, action: DraftAction): DraftState {
    switch (action.type) {
        case "hydrate":
            return { selections: action.selections, skuRows: action.skuRows }
        case "setSelections":
            return { ...state, selections: action.selections }
        case "setSkuRows":
            return { ...state, skuRows: action.rows }
    }
}

/** 编辑态 SKU 对账（纯数据，不碰组件状态）：后端对账出 fresh 行，把本地已填的价格/库存/编码按组合合并进去。
 *  current 用 getter 传入：合并发生在 await 之后，保证读到请求期间最新的本地行（与原实现一致）。 */
async function reconcileSpecSkus(
    id: string,
    selections: SpecSelection[],
    getCurrent: () => SkuDraftRow[],
): Promise<SkuDraftRow[]> {
    const fresh = await ProductsAdminApi.updateProductSpecs({
        path: { id },
        body: { specs: selections },
    })
    return mergeSkuRows(getCurrent(), fresh)
}

/**
 * 发布流程的「草稿持久化」hook —— 显式保存模式。
 *
 * 与「自动保存」模式的区别：**新建态的编辑过程完全本地、不产生任何写库请求**——
 * 直到用户显式点「保存草稿 / 提交商品信息 / 放入仓库」才落库；但**编辑已有商品**时，改规格会调
 * {@link applyProductSpecs} 由后端对账 SKU（要保真实 skuId/价格），此时并非零写库。
 *
 * 职责：
 *  1. 回填：进入时已有 productId（编辑已有商品/续编）→ productDetail 灌值（selections/skuRows/reducer，basic 供 form.reset）
 *  2. 选值级联（完全显式双模式）：
 *     - 新建态（无 productId）：本地笛卡尔积 buildSkuRowsFromSelections 生成组合行，skuId 留空，不落库不建档；
 *     - 编辑态（有 productId）：后端 applyProductSpecs 对账 SKU（组合未变保留 skuId 与新价格）。
 *  3. 保存/发布（见 saveAndPublish：建档 → basic → 规格 → 门槛 → 已设价 SKU → 发布）。
 *
 * 完全显式：编辑过程（标题/图片/价格/选值）都在本地，0 写库请求；只有点「保存草稿/提交/放入仓库」才真正落库。
 */
export function useProductDraft({
    shopId,
    categoryId,
    productId,
    onCreated,
}: {
    shopId?: string
    categoryId?: string
    /** 商品 id：编辑已有商品时由列表页带入；新建为 undefined；保存后回写 */
    productId?: string
    /** 首次建档成功（点保存/提交拿到 productId）时回调，写回 URL search（刷新可恢复） */
    onCreated: (productId: string) => void
}) {
    const [state, dispatch] = useReducer(draftReducer, DRAFT_INITIAL)
    const { selections, skuRows } = state

    const [hydrated, setHydrated] = useState(false)
    const [hydratedBasic, setHydratedBasic] = useState<ProductBasicForm | undefined>()
    /** 编辑已有商品时的当前状态（新建为 undefined）：决定能否切类目/规格是否冻结 */
    const [productStatus, setProductStatus] = useState<ProductStatus | undefined>()
    /** 类目销售属性模板：前端本地算 SKU 组合用（完全显式模式，无需后端生成） */
    const [template, setTemplate] = useState<CategoryAttrNodeResponse[] | undefined>()
    /** 商品 id（编辑已有商品进入即有；新建保存后回写） */
    const productRef = useRef(productId)
    /** 本会话内点保存创建（非续编）：表单即真相源，回填/值不应被 productDetail 回灌 reset */
    const createdThisSessionRef = useRef(false)
    const [creating, setCreating] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // 渲染期不写 ref（React Compiler 禁止）：在 effect 中同步，读方均为事件回调/后续 effect
    const skuRowsRef = useRef(skuRows)
    const selectionsRef = useRef(selections)
    useEffect(() => {
        skuRowsRef.current = skuRows
        selectionsRef.current = selections
    }, [skuRows, selections])

    // ---- 类目属性模板加载（本地组合 SKU 依赖；失败静默，组合留空） ----
    // 模板拉取失败：本地组合退化为单规格，不做阻塞。
    useEffect(() => {
        if (!categoryId) return
        let cancelled = false
        const loadTemplate = async () => {
            try {
                const nodes = await CategoriesApi.getPublicCategoryAttrTemplate({
                    path: { id: categoryId },
                })
                if (!cancelled) setTemplate(nodes.filter((n) => n.attr.kind === "SPEC"))
            } catch {
                /* 静默：退化为单规格 */
            }
        }
        void loadTemplate()
        return () => {
            cancelled = true
        }
    }, [categoryId])

    // ---- 建档（幂等）：只在保存/提交时创建。无 shop/category 则跳过 ----
    async function ensureDraft(basic: ProductBasicForm): Promise<string> {
        if (productRef.current) return productRef.current
        if (!shopId || !categoryId) throw new BusinessError("请先选择店铺和类目")
        setCreating(true)
        // 不用 try/finally（React Compiler 暂不支持 finally 块）：成功/失败路径各自复位 creating
        try {
            const product = await ProductsAdminApi.createProduct({
                body: toBasicPayload(categoryId, basic),
            })
            productRef.current = product.id
            createdThisSessionRef.current = true
            onCreated(product.id)
            setCreating(false)
            return product.id
        } catch (error) {
            setCreating(false)
            throw error
        }
    }

    // ---- 商品回填：有 productId 时拉详情灌值（selections/skuRows 入 reducer，basic 入 hydratedBasic 供 form.reset） ----
    // 仅当「进入时即存在 productId（续编/编辑已有商品）」才回填；本会话点保存创建的，表单数据已是真相源，跳过回灌避免冲掉用户输入。
    useEffect(() => {
        if (!shopId || !productId || createdThisSessionRef.current) return
        let cancelled = false
        setHydrated(false)
        const hydrate = async () => {
            try {
                const detail = await ProductsAdminApi.getShopProductDetail({
                    path: { id: productId },
                })
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                dispatch({
                    type: "hydrate",
                    selections: detail.product.specs.map((s) => ({
                        attrId: s.attrId,
                        valueIds: s.values.map((v) => v.valueId),
                        customValues: [],
                    })),
                    skuRows: detail.skus.map(rowFromSku),
                })
                setHydratedBasic({
                    images: detail.product.images,
                    name: detail.product.name,
                    subtitle: detail.product.subtitle ?? "",
                    detailImages: detail.product.detailImages,
                })
                setProductStatus(detail.product.status)
                setHydrated(true)
            } catch {
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                notify.error("商品信息加载失败，请刷新重试")
                setHydrated(true)
            }
        }
        void hydrate()
        return () => {
            cancelled = true
        }
    }, [shopId, productId])

    // ---- 选值变化 → 生成 SKU 组合行（完全显式双模式） ----
    //  - 新建态（无 productId）：纯本地笛卡尔积（buildSkuRowsFromSelections），skuId 留空，不调后端、不建档；
    //  - 编辑态（有 productId，续编/已保存）：走后端 applyProductSpecs 对账 SKU（组合未变的保留 skuId 与新价格）——
    //    因为编辑态 SKU 已有真实 skuId，落库对账才能保住价格/库存/编码。
    async function applySelectionsToSkus(next: SpecSelection[]) {
        if (!shopId) return
        const id = productRef.current
        if (!id) {
            // 新建态：本地组合（完全显式，无任何写库/建档）
            const rows = buildSkuRowsFromSelections(template ?? [], next)
            dispatch({ type: "setSkuRows", rows })
            return
        }
        // 编辑态：后端对账。选择清空 → 清网格；否则按 skuId 保留已填价
        if (next.length === 0) {
            dispatch({ type: "setSkuRows", rows: [] })
            return
        }
        try {
            const rows = await reconcileSpecSkus(id, next, () => skuRowsRef.current)
            dispatch({ type: "setSkuRows", rows })
        } catch {
            // 生成失败：保留原行，toast 提示避免无感知
            notify.error("生成商品规格失败，请重试")
        }
    }

    function setSelections(next: SpecSelection[]) {
        dispatch({ type: "setSelections", selections: next })
        void applySelectionsToSkus(next)
    }

    // ---- 编辑回填后边界修正：有选值但无 SKU（草稿已含 specs），补齐一次级联 ----
    // 依赖用 productId（productRef.current 与其同步变化）：ref 不能进依赖数组。
    // 异步逻辑内联并带 cancelled 门控：effect 重跑/卸载后，在途请求的结果被丢弃，不乱序写状态。
    useEffect(() => {
        if (!(hydrated && productRef.current && selections.length > 0 && skuRows.length === 0)) {
            return
        }
        const id = productRef.current
        let cancelled = false
        void (async () => {
            try {
                const rows = await reconcileSpecSkus(id, selections, () => skuRowsRef.current)
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                dispatch({ type: "setSkuRows", rows })
            } catch {
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                notify.error("生成商品规格失败，请重试")
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, productId])

    // ---- 保存/发布的编排（显式保存唯一落库入口）。草稿=完整持久化但不发布（无门槛），提交=完整+发布 ----
    // 每一步是一个语义化小函数，各自携带「为什么」；主流程只读意图不读实现。
    async function saveAndPublish(basic: ProductBasicForm, mode: SaveMode): Promise<void> {
        if (!shopId) return
        setSubmitting(true)
        // 注：React Compiler 暂不支持 try/finally，失败路径用 catch + Promise.reject 等价上抛；成功/失败各自复位 submitting
        try {
            // 1. 建档（首次才 POST；编辑态复用）——拿到可落库的 productId（草稿/提交都需先有商品）
            const id = await ensureDraft(basic)
            if (!id) return
            // 2. 落 basic（标题/图片/卖点）——草稿与提交都存
            await persistBasic(id, basic)
            // 3. 落规格拿真实 skuId + 本地已填价搬回（草稿降级跳过，提交严格）
            await persistSpecs(id, mode)
            // 4. 门槛绑定「动作目标」而非「商品状态」（规则见 edit-rules；保存≠发布，后端 ensurePublishable 仍兜底 409）
            const gate = publishGateError(skuRowsRef.current, mode, productStatus)
            if (gate) throw new BusinessError(gate)
            // 5. 只回传「已设价」的 SKU（净空价不发——草稿无门槛的关键：没设价的 SKU 不写 0，留着下次补）
            await persistPricedSkus(id)
            // 6. 发布：仅「本次操作会发布」（新建/草稿会话点提交/入库）才 publish；仓库/上架会话保存变更不回退状态
            if (willPublish(mode, productStatus)) {
                await ProductsAdminApi.publishProduct({
                    path: { id },
                    query: { target: mode === "warehouse" ? "WAREHOUSE" : "PUBLISHED" },
                })
            }
            setSubmitting(false)
        } catch (error) {
            setSubmitting(false)
            return Promise.reject(error)
        }
    }

    /** 落 basic（标题/图片/卖点）——草稿与提交都存，保证下次进来能完整续编。 */
    function persistBasic(id: string, basic: ProductBasicForm): Promise<unknown> {
        return ProductsAdminApi.updateProduct({
            path: { id },
            body: toBasicPayload(categoryId!, basic),
        })
    }

    /** 落 specs 拿真实 skuId（无选值→单规格隐藏 SKU；有选值→对账生成网格；编辑态幂等）。
     *  草稿与提交都做：把当前已配置的规格/组合持久化下来，保证下次进来能完整续编。
     *  草稿无门槛：规格落库失败（如某维度未选值）时降级跳过规格，仍存 basic；提交模式保持严格（失败抛错让用户看到）。 */
    async function persistSpecs(id: string, mode: SaveMode): Promise<void> {
        try {
            const fresh = await ProductsAdminApi.updateProductSpecs({
                path: { id },
                body: { specs: selectionsRef.current },
            })
            // 把本地已填的价格/库存/编码按「组合值」搬到后端行上（本地行 skuId 空，不能按 id 匹配）
            const withDraft = mergeLocalPricedRows(skuRowsRef.current, fresh.map(rowFromSku))
            dispatch({ type: "setSkuRows", rows: withDraft })
            skuRowsRef.current = withDraft
        } catch (error) {
            if (mode !== "draft") throw error
            // 草稿：规格落不了就先跳过，basic 已存，下次可再补
        }
    }

    /** 只回传「已设价且已建档」的 SKU 行落库；空价 SKU 不发（草稿无门槛的关键：没设价的 SKU 不写 0）。 */
    async function persistPricedSkus(id: string): Promise<void> {
        const priced = toSkuUpdateItems(skuRowsRef.current)
        if (priced.length > 0) {
            await ProductsAdminApi.updateProductSkus({ path: { id }, body: { items: priced } })
        }
    }

    // 类目为 undefined 时 ensureDraft/persistBasic 已各自拦截；这里给 saveAndPublish 的调用方一个明确入口
    return {
        selections,
        setSelections,
        skuRows,
        setSkuRows: (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows }),
        ensureDraft,
        /** 显式保存：草稿只落库，submit/warehouse 才发布 */
        submit: saveAndPublish,
        submitting,
        creating,
        hydrated,
        /** 编辑回填：有 productId 时 basic 字段的初值（供调用方 form.reset 灌值）；新建时为 undefined */
        hydratedBasic,
        /** 编辑已有商品时的状态（新建为 undefined）：BasicStep 据此决定能否切类目 / 规格是否冻结 */
        productStatus,
    }
}
