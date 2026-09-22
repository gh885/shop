import { ProductsAdminApi } from "@shop/api/sdk"
import { useEffect, useReducer, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { publishGateError, willPublish, type SaveMode } from "#/product/edit-rules"
import { categorySpecTemplateOptions, productDetailOptions } from "#/product/queries"
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
 *  3. 保存/发布（建档 → basic → 规格 → 门槛 → 已设价 SKU → 发布）。
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
    /** 类目销售属性模板：前端本地算 SKU 组合用（完全显式模式，无需后端生成）；失败静默，组合留空 */
    const template = useQuery(categorySpecTemplateOptions(categoryId)).data
    /** 商品 id（编辑已有商品进入即有；新建保存后回写） */
    const productRef = useRef(productId)
    /** 本会话内点保存创建（非续编）：表单即真相源，回填/值不应被 productDetail 回灌 reset */
    const createdThisSessionRef = useRef(false)
    const [creating, setCreating] = useState(false)

    // 编辑回填的数据源：与列表页编辑弹窗共用一份缓存（productKeys.detail），
    // 不再自己 useEffect + useState 拉一份拷贝 —— 否则弹窗改完 SKU，发布页看到的还是旧值
    const detailQuery = useQuery(
        productDetailOptions(createdThisSessionRef.current ? undefined : productId),
    )
    const detail = detailQuery.data
    /** 编辑已有商品时的当前状态（新建为 undefined）：决定能否切类目/规格是否冻结 */
    const productStatus = detail?.product.status

    // 渲染期不写 ref（React Compiler 禁止）：在 effect 中同步，读方均为事件回调/后续 effect
    const skuRowsRef = useRef(skuRows)
    const selectionsRef = useRef(selections)
    useEffect(() => {
        skuRowsRef.current = skuRows
        selectionsRef.current = selections
    }, [skuRows, selections])

    // 写通道：本 hook 的两个用户级写操作一律库 useMutation + meta 声明（见 frontend.md「写操作」）
    // 保存/发布整条编排是**一个**用户级写操作（建档→basic→规格→门槛→SKU→发布），失败由调用方
    // 渲染成页内 serverError 横幅（错误已被用户看见），故 meta 显式 silentError。
    const save = useMutation({
        mutationFn: ({ basic, mode }: { basic: ProductBasicForm; mode: SaveMode }) =>
            saveAndPublish(basic, mode),
        meta: { silentError: true },
    })
    // 编辑态改选值 → 后端对账 SKU 是独立小写操作：失败全局按 meta.error 提示。
    // 合并发生在 await 之后读 skuRowsRef，保证拿到请求期间最新的本地行（原 getCurrent 语义）。
    const reconcileSkus = useMutation({
        mutationFn: ({ id, specs }: { id: string; specs: SpecSelection[] }) =>
            ProductsAdminApi.updateProductSpecs({ path: { id }, body: { specs } }).then((fresh) =>
                mergeSkuRows(skuRowsRef.current, fresh),
            ),
        meta: { error: "生成商品规格失败，请重试" },
    })

    // 建档（幂等）：只在保存/提交时创建。无 shop/category 则跳过
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

    // 商品回填：详情到达后灌值（selections/skuRows 入 reducer，basic 入 hydratedBasic 供 form.reset）
    // 仅当「进入时即存在 productId（续编/编辑已有商品）」才回填；本会话点保存创建的，表单数据已是真相源，跳过回灌避免冲掉用户输入。
    const detailError = detailQuery.error
    useEffect(() => {
        if (!shopId || !productId || createdThisSessionRef.current) return
        if (detailError) {
            // 详情拉不到也放行 hydrated：否则表单永远停在 loading 骨架，用户无从下手
            notify.error("商品信息加载失败，请刷新重试")
            // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- 详情到达后灌值进表单是刻意数据流（异步数据不能渲染期派生）
            setHydrated(true)
            return
        }
        if (!detail) return
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
            sevenDayReturn: detail.product.sevenDayReturn,
        })
        // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- 详情到达后灌值进表单是刻意数据流（异步数据不能渲染期派生）
        setHydrated(true)
        // detail / detailError 都由 query 派生（同一份缓存，与列表页编辑弹窗共享），
        // 不追踪 detailPending：它是「还没到」不是「变了」，不该触发 hydrate
    }, [shopId, productId, detail, detailError])

    // 选值变化 → 生成 SKU 组合行（完全显式双模式）
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
            const rows = await reconcileSkus.mutateAsync({ id, specs: next })
            dispatch({ type: "setSkuRows", rows })
        } catch {
            // 失败提示已由全局 MutationCache 按 meta.error 执行，这里只吞掉 rejection
        }
    }

    function setSelections(next: SpecSelection[]) {
        dispatch({ type: "setSelections", selections: next })
        void applySelectionsToSkus(next)
    }

    // 编辑回填后边界修正：有选值但无 SKU（草稿已含 specs），补齐一次级联
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
                const rows = await reconcileSkus.mutateAsync({ id, specs: selections })
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                dispatch({ type: "setSkuRows", rows })
            } catch {
                // 失败提示由全局 MutationCache 按 meta.error 执行；cancelled 只拦状态写入
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, productId])

    // 保存/发布的编排（显式保存唯一落库入口）。草稿=完整持久化但不发布（无门槛），提交=完整+发布。
    // 本函数是 save mutation 的 mutationFn：一次用户级写操作，失败统一由调用方内联展示（meta.silentError）。
    // 每一步是一个语义化小函数，各自携带「为什么」；主流程只读意图不读实现。
    async function saveAndPublish(basic: ProductBasicForm, mode: SaveMode): Promise<void> {
        if (!shopId) return
        // 1. 建档（首次才 POST；编辑态复用）——拿到可落库的 productId（草稿/提交都需先有商品）
        const id = await ensureDraft(basic)
        if (!id) return
        // 2. 落 basic（标题/图片/卖点）——草稿与提交都存
        await persistBasic(id, basic)
        // 3. 落规格拿真实 skuId + 本地已填价搬回（草稿降级跳过，提交严格）
        await persistSpecs(id, mode)
        // 4. 门槛绑定「动作目标」而非「商品状态」（保存≠发布，后端 ensurePublishable 仍兜底 409）
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
        /** 显式保存：草稿只落库，submit/warehouse 才发布（失败 reject 给调用方内联展示） */
        submit: (basic: ProductBasicForm, mode: SaveMode) => save.mutateAsync({ basic, mode }),
        submitting: save.isPending,
        creating,
        hydrated,
        /** 编辑回填：有 productId 时 basic 字段的初值（供调用方 form.reset 灌值）；新建时为 undefined */
        hydratedBasic,
        /** 编辑已有商品时的状态（新建为 undefined）：BasicStep 据此决定能否切类目 / 规格是否冻结 */
        productStatus,
    }
}
