import { ProductsAdminApi, type ProductDetailResponse, type ProductStatus } from "@shop/api/sdk"
import { useEffect, useReducer, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import type { SaveMode } from "#/product/edit-rules"
import { categorySpecTemplateOptions, productDetailOptions } from "#/product/queries"
import {
    buildSkuRowsFromSelections,
    mergeSkuRows,
    rowFromSku,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelection,
} from "#/product/draft-model"

import { saveAndPublish, type DraftPersistContext } from "./draft-persist"

/** 本 hook 受控值快照（basic 由调用方 useAppForm 持有，不入此 reducer） */
type DraftState = { selections: SpecSelection[]; skuRows: SkuDraftRow[] }
type DraftAction =
    | { type: "hydrate"; selections: SpecSelection[]; skuRows: SkuDraftRow[] }
    | { type: "setSelections"; selections: SpecSelection[] }
    | { type: "setSkuRows"; rows: SkuDraftRow[] }
const DRAFT_INITIAL: DraftState = { selections: [], skuRows: [] }

/** 商品详情的规格 → 选值快照（valueImages 从每个 value 的 image 汇成 valueId→图片 的表） */
function selectionsFromDetail(detail: ProductDetailResponse): SpecSelection[] {
    return detail.product.specs.map((s) => ({
        attrId: s.attrId,
        valueIds: s.values.map((v) => v.valueId),
        customValues: [],
        valueImages: Object.fromEntries(
            s.values.flatMap((v) => (v.image ? [[v.valueId, v.image]] : [])),
        ),
    }))
}

/** 商品详情 → basic 表单初值（subtitles 缺省成空串，form.reset 不用处理 undefined） */
function basicFromDetail(detail: ProductDetailResponse): ProductBasicForm {
    return {
        images: detail.product.images,
        name: detail.product.name,
        subtitle: detail.product.subtitle ?? "",
        detailImages: detail.product.detailImages,
        sevenDayReturn: detail.product.sevenDayReturn,
    }
}

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

/** 选值→SKU 行的依赖（全部显式传入：这个级联不依赖 React 状态，只依赖这几个值） */
type SelectionCascadeDeps = {
    shopId: string | undefined
    /** 类目销售属性模板：本地笛卡尔积的输入 */
    template: Parameters<typeof buildSkuRowsFromSelections>[0]
    /** 已建档的商品 id：有值 = 编辑态（走后端对账），空 = 新建态（纯本地） */
    productRef: { current: string | undefined }
    /** 后端对账（发 updateProductSpecs 并合并已填价） */
    reconcile: (id: string, specs: SpecSelection[]) => Promise<SkuDraftRow[]>
    setSkuRows: (rows: SkuDraftRow[]) => void
}

/**
 * 选值变化 → 生成 SKU 组合行（完全显式双模式）。
 *
 *  - 新建态（无 productId）：纯本地笛卡尔积（buildSkuRowsFromSelections），skuId 留空，不调后端、不建档；
 *  - 编辑态（有 productId，续编/已保存）：走后端 applyProductSpecs 对账 SKU（组合未变的保留 skuId 与新价格）——
 *    因为编辑态 SKU 已有真实 skuId，落库对账才能保住价格/库存/编码。
 */
async function cascadeSelectionsToSkus(
    deps: SelectionCascadeDeps,
    next: SpecSelection[],
): Promise<void> {
    if (!deps.shopId) return
    const id = deps.productRef.current
    if (!id) {
        // 新建态：本地组合（完全显式，无任何写库/建档）
        deps.setSkuRows(buildSkuRowsFromSelections(deps.template, next))
        return
    }
    // 编辑态：后端对账。选择清空 → 清网格；否则按 skuId 保留已填价
    if (next.length === 0) {
        deps.setSkuRows([])
        return
    }
    try {
        deps.setSkuRows(await deps.reconcile(id, next))
    } catch {
        // 失败提示已由全局 MutationCache 按 meta.error 执行，这里只吞掉 rejection
    }
}

/** 选值/SKU 行的 ref 快照：await 期间可能被改，落库与对账要拿最新的那份 */
type DraftSnapshot = {
    selectionsRef: { current: SpecSelection[] }
    skuRowsRef: { current: SkuDraftRow[] }
}

/**
 * 发布流程的「草稿持久化」hook —— 显式保存模式。
 *
 * 与「自动保存」模式的区别：**新建态的编辑过程完全本地、不产生任何写库请求**——
 * 直到用户显式点「保存草稿 / 提交商品信息 / 放入仓库」才落库；但**编辑已有商品**时，改规格会调
 * {@link applyProductSpecs} 由后端对账 SKU（要保真实 skuId/价格），此时并非零写库。
 *
 * 本 hook 只做编排，三块职责各自一个子 hook（读哪块就看哪个 hook）：
 *  1. useDraftHydration —— 回填：进入时已有 productId（编辑已有商品/续编）→ productDetail 灌值
 *     （selections/skuRows 进 reducer，basic 供 form.reset）
 *  2. useSkuCascade —— 选值级联（完全显式双模式）：
 *     - 新建态（无 productId）：本地笛卡尔积 buildSkuRowsFromSelections 生成组合行，skuId 留空，不落库不建档；
 *     - 编辑态（有 productId）：后端 applyProductSpecs 对账 SKU（组合未变保留 skuId 与新价格）。
 *  3. useMutation（落库）—— 保存/发布（建档 → basic → 规格 → 门槛 → 已设价 SKU → 发布）。
 */
/** useProductDraft 的入参：建档/落库要用到的四件事（草稿值由内部 reducer 持有） */
type ProductDraftInput = {
    shopId?: string
    categoryId?: string
    /** 商品 id：编辑已有商品时由列表页带入；新建为 undefined；保存后回写 */
    productId?: string
    /** 首次建档成功（点保存/提交拿到 productId）时回调，写回 URL search（刷新可恢复） */
    onCreated: (productId: string) => void
}

export function useProductDraft({ shopId, categoryId, productId, onCreated }: ProductDraftInput) {
    const [state, dispatch] = useReducer(draftReducer, DRAFT_INITIAL)
    const { selections, skuRows } = state
    const setSkuRows = (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows })

    // 「这份草稿是谁」：类目模板 + 已建档 id + 是否本会话创建 + 编辑回填的数据源
    const identity = useDraftIdentity({ categoryId, productId })
    const { createdThisSession } = identity

    const hydration = useDraftHydration({
        shopId,
        productId,
        createdThisSession,
        detail: identity.detail,
        dispatch,
    })

    // 渲染期不写 ref（React Compiler 禁止）：在 effect 中同步，读方均为事件回调/后续 effect
    const snapshot = useDraftSnapshot(selections, skuRows)

    // 两个写通道（保存/发布 + 选值级联）合在一起：它们的输入都是「身份 + 回填 + 快照」
    const writes = useDraftWrites({
        shopId,
        categoryId,
        productId,
        onCreated,
        identity,
        snapshot,
        productStatus: hydration.productStatus,
        hydrated: hydration.hydrated,
        selections,
        skuRowCount: skuRows.length,
        setSelections: (next) => dispatch({ type: "setSelections", selections: next }),
        setSkuRows,
    })

    // 对外只交「受控值 + 写入口」：建档与落库都由 submit 内部编排（调用方的 categoryId 由路由守卫保证必填）
    return {
        selections,
        setSelections: writes.setSelections,
        skuRows,
        setSkuRows,
        /** 显式保存：草稿只落库，submit/warehouse 才发布（失败 reject 给调用方内联展示） */
        submit: writes.submit,
        submitting: writes.submitting,
        creating: identity.creating,
        /** 回填是否完成：编辑态在详情到达前为 false（失败不置位，查询抛给路由错误页） */
        hydrated: hydration.hydrated,
        /**
         * 页面骨架闸门：编辑态（有 productId 且非本会话创建）且详情未到。
         * 调用方据此**不挂表单**（只挂骨架）——空表单 + DRAFT 权限集在详情失败时会变成数据丢失路径，
         * 详见 useDraftHydration 的注释。新建态恒为 false（无详情可等）。
         */
        hydrating: productId !== undefined && !identity.createdThisSession && !hydration.hydrated,
        /** 编辑回填：有 productId 时 basic 字段的初值（供调用方 form.reset 灌值）；新建时为 undefined */
        hydratedBasic: hydration.hydratedBasic,
        /** 编辑已有商品时的状态（新建为 undefined）：BasicStep 据此决定能否切类目 / 规格是否冻结 */
        productStatus: hydration.productStatus,
    }
}

/**
 * 「这份草稿是谁」：类目销售属性模板、本会话已建档的 id、是否本会话创建、以及编辑回填的数据源。
 *
 * 之所以成一块：它们共同决定「现在是新建还是编辑、能不能拉详情、回填要不要放行」，
 * 散在主编排里读起来要同时提四个变量名。
 */
function useDraftIdentity({
    categoryId,
    productId,
}: {
    categoryId: string | undefined
    productId: string | undefined
}) {
    // 类目销售属性模板：前端本地算 SKU 组合用（完全显式模式，无需后端生成）；失败静默，组合留空
    const template = useQuery(categorySpecTemplateOptions(categoryId)).data
    /** 商品 id（编辑已有商品进入即有；新建保存后回写） */
    const productRef = useRef(productId)
    const [creating, setCreating] = useState(false)
    /** 本会话内点保存创建（非续编）：表单即真相源，回填/值不应被 productDetail 回灌 reset。
     *  是普通 state 而非 ref：渲染期要用它决定详情查询的 key（ref 不能在渲染期读），建档后由
     *  draft-persist 回调 markCreatedInSession 置位。 */
    const [createdThisSession, setCreatedThisSession] = useState(false)

    // 编辑回填的数据源：与列表页编辑弹窗共用一份缓存（productDetail）——
    // 不自己再拉一份拷贝，否则弹窗改完 SKU，发布页看到的还是旧值
    const detailQuery = useQuery(productDetailOptions(createdThisSession ? undefined : productId))

    return {
        template,
        productRef,
        creating,
        setCreating,
        createdThisSession,
        markCreatedInSession: () => setCreatedThisSession(true),
        detail: detailQuery.data,
    }
}

function useDraftSnapshot(selections: SpecSelection[], skuRows: SkuDraftRow[]): DraftSnapshot {
    const skuRowsRef = useRef(skuRows)
    const selectionsRef = useRef(selections)
    useEffect(() => {
        skuRowsRef.current = skuRows
        selectionsRef.current = selections
    }, [skuRows, selections])
    return { selectionsRef, skuRowsRef }
}

/**
 * 商品回填：进入时已有 productId（编辑已有商品/续编）→ 详情到达后灌值。
 *
 * 仅当「进入时即存在 productId」才回填；本会话点保存创建的，表单数据已是真相源，
 * 跳过回灌避免冲掉用户输入。数据源与列表页编辑弹窗共用同一份 productDetail 缓存。
 *
 * **失败不放行**：详情拉不到时 `hydrated` 保持 false，页面停在骨架（且该查询失败会抛给路由错误页，
 * 骨架只是它到达之前的窗口）。早先这里有一条例外分支「拉不到也 setHydrated(true) + toast」，
 * 已删除——回填失败时那份表单是**空的**，而编辑态一旦挂载就会拿到 `editRules(undefined) === DRAFT`
 * 的最宽松权限集（可切类目 / 可改规格 / 显示「提交」发布动作），用户点一次保存就是
 * `persistBasic` / `persistSpecs` 拿空值整份覆盖已有商品（标题/图片/卖点/规格被抹掉）。
 * 宁可停在骨架，也不能让「没数据」长成「可保存的空表单」。
 */
function useDraftHydration({
    shopId,
    productId,
    createdThisSession,
    detail,
    dispatch,
}: {
    shopId: string | undefined
    productId: string | undefined
    /** 本会话已点保存建档：表单数据已是真相源，跳过回灌 */
    createdThisSession: boolean
    /** 商品详情（与列表页编辑弹窗同缓存） */
    detail: ProductDetailResponse | undefined
    dispatch: (action: DraftAction) => void
}) {
    const [hydrated, setHydrated] = useState(false)
    const [hydratedBasic, setHydratedBasic] = useState<ProductBasicForm | undefined>()
    /** 编辑已有商品时的当前状态（新建为 undefined）：决定能否切类目/规格是否冻结 */
    const productStatus = detail?.product.status

    useEffect(() => {
        if (!shopId || !productId || createdThisSession) return
        if (!detail) return
        // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react/set-state-in-effect -- 回填是一次性的异步数据流（详情到达后把表单从骨架切到可填），渲染期派生不出来
        dispatch({
            type: "hydrate",
            selections: selectionsFromDetail(detail),
            skuRows: detail.skus.map(rowFromSku),
        })
        setHydratedBasic(basicFromDetail(detail))
        setHydrated(true)
        // detail 由 query 派生（同一份缓存，与列表页编辑弹窗共享），不追踪 detailPending：
        // 它是「还没到」不是「变了」，不该触发 hydrate
    }, [shopId, productId, createdThisSession, detail, dispatch])

    return { hydrated, hydratedBasic, productStatus }
}

/**
 * 保存/发布：整条编排是**一个**用户级写操作，失败由调用方渲染成页内 serverError 横幅
 * （错误已被用户看见），故 meta 显式 silentError。落库编排不依赖 React 状态（draft-persist.ts），
 * 所以它要的只是上头显式列出的这几个值与两个 ref。
 */
function useDraftSave({
    shopId,
    categoryId,
    productStatus,
    productRef,
    markCreatedInSession,
    snapshot,
    onCreated,
    setCreating,
    setSkuRows,
}: {
    shopId: string | undefined
    categoryId: string | undefined
    productStatus: ProductStatus | undefined
    productRef: { current: string | undefined }
    markCreatedInSession: () => void
    snapshot: DraftSnapshot
    onCreated: (productId: string) => void
    setCreating: (creating: boolean) => void
    setSkuRows: (rows: SkuDraftRow[]) => void
}) {
    const persistCtx: DraftPersistContext = {
        shopId,
        categoryId,
        productStatus,
        productRef,
        markCreatedInSession,
        selectionsRef: snapshot.selectionsRef,
        skuRowsRef: snapshot.skuRowsRef,
        onCreated,
        setCreating,
        setSkuRows,
    }
    const save = useMutation({
        mutationFn: ({ basic, mode }: { basic: ProductBasicForm; mode: SaveMode }) =>
            saveAndPublish(persistCtx, basic, mode),
        meta: { silentError: true },
    })

    return {
        submit: (basic: ProductBasicForm, mode: SaveMode) => save.mutateAsync({ basic, mode }),
        submitting: save.isPending,
    }
}

/** 后端 SKU 对账写操作：编辑态改选值与回填补齐都走它，失败由全局按 meta.error 提示 */
function useSkuReconcile(skuRowsRef: {
    current: SkuDraftRow[]
}): (id: string, specs: SpecSelection[]) => Promise<SkuDraftRow[]> {
    const reconcile = useMutation({
        mutationFn: ({ id, specs }: { id: string; specs: SpecSelection[] }) =>
            ProductsAdminApi.updateProductSpecs({ path: { id }, body: { specs } }).then((fresh) =>
                mergeSkuRows(skuRowsRef.current, fresh),
            ),
        meta: { error: "生成商品规格失败，请重试" },
    })
    return (id, specs) => reconcile.mutateAsync({ id, specs })
}

/**
 * 选值 → SKU 行：写入口（新建态本地笛卡尔积 / 编辑态后端对账）+ 回填后补一次对账。
 *
 * 三处都要后端对账（改选值、回填补齐），所以对账写操作在这里建一次，三条路径共用。
 */
/**
 * 草稿的两个写通道：保存/发布（一条用户级写操作）与选值级联（改选值 + 回填补齐）。
 *
 * 两者输入同源（都是「身份 + 回填状态 + 值快照」），故合在一个 hook 里接线；
 * 各自实现仍在 useDraftSave / useSkuCascade 里。
 */
function useDraftWrites({
    shopId,
    categoryId,
    productId,
    onCreated,
    identity,
    snapshot,
    productStatus,
    hydrated,
    selections,
    skuRowCount,
    setSelections,
    setSkuRows,
}: {
    shopId: string | undefined
    categoryId: string | undefined
    productId: string | undefined
    onCreated: (productId: string) => void
    identity: ReturnType<typeof useDraftIdentity>
    snapshot: DraftSnapshot
    productStatus: ProductStatus | undefined
    hydrated: boolean
    selections: SpecSelection[]
    skuRowCount: number
    setSelections: (next: SpecSelection[]) => void
    setSkuRows: (rows: SkuDraftRow[]) => void
}) {
    const save = useDraftSave({
        shopId,
        categoryId,
        productStatus,
        productRef: identity.productRef,
        markCreatedInSession: identity.markCreatedInSession,
        snapshot,
        onCreated,
        setCreating: identity.setCreating,
        setSkuRows,
    })

    const cascade = useSkuCascade({
        shopId,
        template: identity.template,
        // ref 随依赖对象一起传（不单独当参数）：级联只在事件回调/effect 里用，不在渲染期读
        refs: { productRef: identity.productRef },
        snapshot,
        hydrated,
        productId,
        selections,
        skuRowCount,
        setSelections,
        setSkuRows,
    })

    return { ...save, setSelections: cascade.setSelections }
}

/** 选值级联的接线：级联模式（新建/编辑）+ 回填补齐闸门所需的值 */
type SkuCascadeDeps = {
    shopId: string | undefined
    template: Parameters<typeof buildSkuRowsFromSelections>[0] | undefined
    refs: { productRef: { current: string | undefined } }
    snapshot: DraftSnapshot
    hydrated: boolean
    productId: string | undefined
    selections: SpecSelection[]
    skuRowCount: number
    setSelections: (next: SpecSelection[]) => void
    setSkuRows: (rows: SkuDraftRow[]) => void
}

function useSkuCascade({
    shopId,
    template,
    refs,
    snapshot,
    hydrated,
    productId,
    selections,
    skuRowCount,
    setSelections,
    setSkuRows,
}: SkuCascadeDeps) {
    const reconcile = useSkuReconcile(snapshot.skuRowsRef)

    /** 选值写入口：先改受控选值，再按新建/编辑两态级联出 SKU 行（见文件上方 cascadeSelectionsToSkus） */
    const changeSelections = (next: SpecSelection[]) => {
        setSelections(next)
        void cascadeSelectionsToSkus(
            {
                shopId,
                template: template ?? [],
                productRef: refs.productRef,
                reconcile,
                setSkuRows,
            },
            next,
        )
    }

    // 编辑回填后边界修正：有选值但无 SKU（草稿已含 specs），补齐一次级联。
    // 依赖用 productId（ref 不能进依赖数组）；异步逻辑带 cancelled 门控：effect 重跑/卸载后，
    // 在途请求的结果被丢弃，不乱序写状态。
    useEffect(() => {
        if (!hydrated) return
        const id = refs.productRef.current
        if (!id || selections.length === 0 || skuRowCount !== 0) return
        let cancelled = false
        void (async () => {
            try {
                const rows = await reconcile(id, selections)
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
                if (cancelled) return
                setSkuRows(rows)
            } catch {
                // 失败提示由全局 MutationCache 按 meta.error 执行；cancelled 只拦状态写入
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, productId])

    return { setSelections: changeSelections }
}
