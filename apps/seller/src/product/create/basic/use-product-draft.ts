import { ProductsAdminApi, type ProductDetailResponse } from "@shop/api/sdk"
import { useEffect, useReducer, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import type { SaveMode } from "#/product/edit-rules"
import { categorySpecTemplateOptions, productDetailOptions } from "#/product/queries"
import { notify } from "@shop/app-kit"
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
    // 落库编排的依赖全在这里显式列出（编排本身在 draft-persist.ts，不依赖 React 状态）
    const persistCtx: DraftPersistContext = {
        shopId,
        categoryId,
        productStatus,
        productRef,
        createdThisSessionRef,
        selectionsRef,
        skuRowsRef,
        onCreated,
        setCreating,
        setSkuRows: (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows }),
    }

    const save = useMutation({
        mutationFn: ({ basic, mode }: { basic: ProductBasicForm; mode: SaveMode }) =>
            saveAndPublish(persistCtx, basic, mode),
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

    // 建档与落库编排已搬到 draft-persist.ts（不依赖 React 状态，降 hook 认知复杂度）

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
            selections: selectionsFromDetail(detail),
            skuRows: detail.skus.map(rowFromSku),
        })
        setHydratedBasic(basicFromDetail(detail))
        // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- 详情到达后灌值进表单是刻意数据流（异步数据不能渲染期派生）
        setHydrated(true)
        // detail / detailError 都由 query 派生（同一份缓存，与列表页编辑弹窗共享），
        // 不追踪 detailPending：它是「还没到」不是「变了」，不该触发 hydrate
    }, [shopId, productId, detail, detailError])

    // 选值变化 → 生成 SKU 组合行（完全显式双模式，见文件末尾 cascadeSelectionsToSkus）

    function setSelections(next: SpecSelection[]) {
        dispatch({ type: "setSelections", selections: next })
        void cascadeSelectionsToSkus(
            {
                shopId,
                template: template ?? [],
                productRef,
                reconcile: (id, specs) => reconcileSkus.mutateAsync({ id, specs }),
                setSkuRows: (rows) => dispatch({ type: "setSkuRows", rows }),
            },
            next,
        )
    }

    // 编辑回填后边界修正：有选值但无 SKU（草稿已含 specs），补齐一次级联
    // 依赖用 productId（productRef.current 与其同步变化）：ref 不能进依赖数组。
    // 异步逻辑内联并带 cancelled 门控：effect 重跑/卸载后，在途请求的结果被丢弃，不乱序写状态。
    /** 回填完成、有已建档 id、选了值但网格还空 —— 这时才需要补一次后端对账 */
    const needsReconcile =
        hydrated && Boolean(productRef.current) && selections.length > 0 && skuRows.length === 0
    useEffect(() => {
        if (!needsReconcile || !productRef.current) return
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

    // 对外只交「受控值 + 写入口」：建档与落库都由 submit 内部编排（调用方的 categoryId 由路由守卫保证必填）
    return {
        selections,
        setSelections,
        skuRows,
        setSkuRows: (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows }),
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
