import { message } from "#/locales/message"
import { ProductsAdminApi, type ProductDetailResponse, type ProductStatus } from "@shop/api/sdk"
import { useEffect, useReducer, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import type { SaveMode } from "#/domains/product/edit-rules"
import { categorySpecTemplateOptions, productDetailOptions } from "#/domains/product/queries"
import {
    buildSkuRowsFromSelections,
    mergeSkuRows,
    rowFromSku,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelection,
} from "#/domains/product/draft-rules"

import { saveAndPublish, type DraftPersistContext } from "./draft-persist"

type DraftState = { selections: SpecSelection[]; skuRows: SkuDraftRow[] }
type DraftAction =
    | { type: "hydrate"; selections: SpecSelection[]; skuRows: SkuDraftRow[] }
    | { type: "setSelections"; selections: SpecSelection[] }
    | { type: "setSkuRows"; rows: SkuDraftRow[] }
const DRAFT_INITIAL: DraftState = { selections: [], skuRows: [] }

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

// subtitle 缺省成空串：让 form.reset 不必处理 undefined
function basicFromDetail(detail: ProductDetailResponse): ProductBasicForm {
    return {
        images: detail.product.images,
        name: detail.product.name,
        subtitle: detail.product.subtitle ?? "",
        detailImages: detail.product.detailImages,
        sevenDayReturn: detail.product.sevenDayReturn,
    }
}

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

type SelectionCascadeDeps = {
    shopId: string | undefined
    template: Parameters<typeof buildSkuRowsFromSelections>[0]
    productRef: { current: string | undefined }
    reconcile: (id: string, specs: SpecSelection[]) => Promise<SkuDraftRow[]>
    setSkuRows: (rows: SkuDraftRow[]) => void
}

// 双模式：新建态(无 productId)纯本地笛卡尔积、零写库；编辑态(有 productId)走后端对账保真实 skuId/已填价
async function cascadeSelectionsToSkus(
    deps: SelectionCascadeDeps,
    next: SpecSelection[],
): Promise<void> {
    if (!deps.shopId) return
    const id = deps.productRef.current
    if (!id) {
        deps.setSkuRows(buildSkuRowsFromSelections(deps.template, next))
        return
    }
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

type DraftSnapshot = {
    selectionsRef: { current: SpecSelection[] }
    skuRowsRef: { current: SkuDraftRow[] }
}

type ProductDraftInput = {
    shopId?: string
    categoryId?: string
    productId?: string
    onCreated: (productId: string) => void
}

export function useProductDraft({ shopId, categoryId, productId, onCreated }: ProductDraftInput) {
    const [state, dispatch] = useReducer(draftReducer, DRAFT_INITIAL)
    const { selections, skuRows } = state
    const setSkuRows = (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows })

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

    return {
        selections,
        setSelections: writes.setSelections,
        skuRows,
        setSkuRows,
        submit: writes.submit,
        submitting: writes.submitting,
        creating: identity.creating,
        hydrated: hydration.hydrated,
        // 骨架闸门：编辑态且详情未到。调用方据此不挂表单——空表单 + DRAFT 权限集在详情失败时会成数据丢失路径
        hydrating: productId !== undefined && !identity.createdThisSession && !hydration.hydrated,
        hydratedBasic: hydration.hydratedBasic,
        productStatus: hydration.productStatus,
    }
}

function useDraftIdentity({
    categoryId,
    productId,
}: {
    categoryId: string | undefined
    productId: string | undefined
}) {
    const template = useQuery(categorySpecTemplateOptions(categoryId)).data
    const productRef = useRef(productId)
    const [creating, setCreating] = useState(false)
    // 用 state 而非 ref：渲染期要读它决定详情查询的 key（ref 不能在渲染期读）；表单即真相源，本会话建档的不回灌 reset
    const [createdThisSession, setCreatedThisSession] = useState(false)

    // 与列表页编辑弹窗共用同一份 productDetail 缓存：不再拉一份拷贝，否则弹窗改完 SKU 发布页看到的还是旧值
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

// 失败不放行：详情拉不到时 hydrated 保持 false 停在骨架。回填失败挂的是空表单 + editRules(undefined)=DRAFT 最宽松权限集，点一次保存就拿空值覆盖已有商品——宁可停骨架也不让「没数据」长成「可保存的空表单」
function useDraftHydration({
    shopId,
    productId,
    createdThisSession,
    detail,
    dispatch,
}: {
    shopId: string | undefined
    productId: string | undefined
    createdThisSession: boolean
    detail: ProductDetailResponse | undefined
    dispatch: (action: DraftAction) => void
}) {
    const [hydrated, setHydrated] = useState(false)
    const [hydratedBasic, setHydratedBasic] = useState<ProductBasicForm | undefined>()
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
    }, [shopId, productId, createdThisSession, detail, dispatch])

    return { hydrated, hydratedBasic, productStatus }
}

// silentError：整条编排是一个用户级写操作，失败由调用方渲染成页内 serverError 横幅（已被用户看见），不再重复弹 toast
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

function useSkuReconcile(skuRowsRef: {
    current: SkuDraftRow[]
}): (id: string, specs: SpecSelection[]) => Promise<SkuDraftRow[]> {
    const reconcile = useMutation({
        mutationFn: ({ id, specs }: { id: string; specs: SpecSelection[] }) =>
            ProductsAdminApi.updateProductSpecs({ path: { id }, body: { specs } }).then((fresh) =>
                mergeSkuRows(skuRowsRef.current, fresh),
            ),
        meta: { error: message("product.toast.specGenFailed") },
    })
    return (id, specs) => reconcile.mutateAsync({ id, specs })
}

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

    // 回填后边界修正：有选值但无 SKU（草稿已含 specs）时补一次级联；依赖用 productId（ref 不能进依赖数组），cancelled 门控丢弃在途结果防乱序写状态
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
                // 失败提示由全局 MutationCache 按 meta.error 执行
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, productId])

    return { setSelections: changeSelections }
}
