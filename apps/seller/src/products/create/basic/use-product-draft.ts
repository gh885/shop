import { useCallback, useEffect, useReducer, useRef, useState } from "react"

import type { SkuUpdateItem } from "@shop/api/sdk"

import {
    applyProductSpecs,
    createProduct,
    productDetail,
    publishProduct,
    updateProduct,
    updateProductSkus,
} from "#/products/data"
import {
    mergeSkuRows,
    rowFromSku,
    type ProductBasicForm,
    type SkuDraftRow,
    type SpecSelections,
} from "./product-form-state"

/** 本 hook 受控值快照（basic 由调用方 useAppForm 持有，不入此 reducer） */
type DraftState = { selections: SpecSelections; skuRows: SkuDraftRow[] }
type DraftAction =
    | { type: "hydrate"; selections: SpecSelections; skuRows: SkuDraftRow[] }
    | { type: "setSelections"; selections: SpecSelections }
    | { type: "setSkuRows"; rows: SkuDraftRow[] }

/**
 * 发布流程的「草稿持久化」hook —— 管理 SKU/选值的受控状态 + 全部请求副作用。
 *
 * 路线 Y'：basic（表单 3 字段）由 useAppForm 持有（TanStack Form 的强项），
 * 这里接手需要「受控 + 回填 + 级联 + 落库」的 selections 与 skuRows，并负责草稿建档与 autosave。
 *
 * 职责：
 *  1. 建档：进入第二步即按 categoryId 建草稿（name 可空，后端草稿允许无名），回调 onCreated 写回 URL
 *  2. 草稿回填：有 draftId 时 productDetail(id) → hydrate selections/skuRows（basic 由调用方灌 form）
 *  3. 选值级联：selections 变化 → updateSpecs → mergeSkuRows（保留已填价）→ setSkuRows
 *  4. autosave：调用方防抖调 saveBasic / saveSkus / saveAll → updateBasic / updateSkus / 级联
 *  5. 提交/发布：组装 skuItems → publish
 */
export function useProductDraft({
    shopId,
    categoryId,
    draftId,
    onCreated,
}: {
    shopId?: string
    categoryId?: string
    draftId?: string
    /** 首次建草稿成功（拿到 draftId）时回调，写回 URL search（刷新可恢复） */
    onCreated: (draftId: string) => void
}) {
    const [state, dispatch] = useReducer(
        (s: DraftState, a: DraftAction): DraftState => {
            switch (a.type) {
                case "hydrate":
                    return { selections: a.selections, skuRows: a.skuRows }
                case "setSelections":
                    return { ...s, selections: a.selections }
                case "setSkuRows":
                    return { ...s, skuRows: a.rows }
                default:
                    return s
            }
        },
        { selections: [], skuRows: [] },
    )
    const { selections, skuRows } = state

    const [hydrated, setHydrated] = useState(false)
    const draftRef = useRef(draftId)
    const [creating, setCreating] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const skuRowsRef = useRef(skuRows)
    skuRowsRef.current = skuRows
    const selectionsRef = useRef(selections)
    selectionsRef.current = selections

    // ---- 建档（幂等）：进入第二步即建，name 可空。无 shop/category 则跳过 ----
    const ensureDraft = useCallback(
        async (basic: ProductBasicForm): Promise<string> => {
            if (draftRef.current) return draftRef.current
            if (!shopId || !categoryId) throw { status: 0, detail: "请先选择店铺和类目" }
            setCreating(true)
            try {
                const product = await createProduct(shopId, {
                    categoryId,
                    name: basic.name || "",
                    subtitle: basic.subtitle || undefined,
                    mainImage: basic.mainImage || undefined,
                })
                draftRef.current = product.id
                onCreated(product.id)
                return product.id
            } finally {
                setCreating(false)
            }
        },
        [shopId, categoryId, onCreated],
    )

    // ---- 进入第二步即建草稿（name 可空）：让 autosave 有 id 可用；有 draftId(续编)则跳过 ----
    // ---- 进入第二步即建草稿（name 可空）：让 autosave 有 id 可用；有 draftId（续编）则跳过 ----
    useEffect(() => {
        if (!shopId || !categoryId || draftRef.current) return
        void ensureDraft({ mainImage: "", name: "", subtitle: "" })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopId, categoryId])

    // ---- 草稿回填：有 draftId 时拉详情灌值 ----
    useEffect(() => {
        if (!shopId || !draftId) return
        let cancelled = false
        setHydrated(false)
        productDetail(shopId, draftId)
            .then((detail) => {
                if (cancelled) return
                dispatch({
                    type: "hydrate",
                    selections: (detail.product?.specs ?? []).map((s) => ({
                        attrId: s.attrId,
                        valueIds: (s.values ?? []).map((v) => v.valueId),
                        customValues: [],
                    })),
                    skuRows: (detail.skus ?? []).map(rowFromSku),
                })
                setHydrated(true)
            })
            .catch(() => setHydrated(true))
        return () => {
            cancelled = true
        }
    }, [shopId, draftId])

    // ---- 选值变化 → 级联生成 SKU（merge 保留已填价） ----
    const applySelectionsToSkus = useCallback(
        async (next: SpecSelections) => {
            if (!shopId) return
            if (next.length === 0) {
                dispatch({ type: "setSkuRows", rows: [] })
                return
            }
            const id = draftRef.current
            if (!id) return // 等草稿建成后再级联（applySpecs 需要 productId）
            try {
                const fresh = await applyProductSpecs(shopId, id, next)
                dispatch({ type: "setSkuRows", rows: mergeSkuRows(skuRowsRef.current, fresh) })
            } catch {
                // 生成失败：保留原行，错误由调用方展示
            }
        },
        [shopId],
    )

    const setSelections = useCallback(
        (next: SpecSelections) => {
            dispatch({ type: "setSelections", selections: next })
            void applySelectionsToSkus(next)
        },
        [applySelectionsToSkus],
    )

    // ---- 回填后若有选值但无 SKU（草稿已含 specs），补齐一次级联 ----
    useEffect(() => {
        if (hydrated && draftRef.current && selections.length > 0 && skuRows.length === 0) {
            void applySelectionsToSkus(selections)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, draftRef.current])

    // ---- autosave：基本信息（updateBasic） ----
    const saveBasic = useCallback(
        async (basic: ProductBasicForm) => {
            const id = draftRef.current
            if (!shopId || !categoryId || !id) return
            await updateProduct(shopId, id, {
                categoryId,
                name: basic.name || "",
                subtitle: basic.subtitle || undefined,
                mainImage: basic.mainImage || undefined,
            })
        },
        [shopId, categoryId],
    )

    // ---- autosave：SKU 行（updateSkus） ----
    const saveSkus = useCallback(async () => {
        const id = draftRef.current
        if (!shopId || !id) return
        const items = skuRowsRef.current.map<SkuUpdateItem>((r) => ({
            skuId: r.skuId,
            price: Number(r.priceText),
            stock: Number(r.stockText) || 0,
            skuCode: r.skuCode.trim() || undefined,
            status: r.status,
        }))
        if (items.length > 0) {
            await updateProductSkus(shopId, id, items)
        }
    }, [shopId])

    // ---- 提交/发布：组 skuItems → publish；草稿模式只落库 ----
    const submit = useCallback(
        async (basic: ProductBasicForm, mode: "submit" | "draft"): Promise<void> => {
            if (!shopId) return
            setSubmitting(true)
            try {
                const id = await ensureDraft(basic)
                const items = skuRowsRef.current.map<SkuUpdateItem>((r) => ({
                    skuId: r.skuId,
                    price: Number(r.priceText),
                    stock: Number(r.stockText) || 0,
                    skuCode: r.skuCode.trim() || undefined,
                    status: r.status,
                }))
                if (items.length > 0) {
                    await updateProductSkus(shopId, id, items)
                }
                if (mode === "submit" && items.length > 0) {
                    await publishProduct(shopId, id)
                }
            } finally {
                setSubmitting(false)
            }
        },
        [ensureDraft, shopId],
    )

    return {
        selections,
        setSelections,
        skuRows,
        setSkuRows: (rows: SkuDraftRow[]) => dispatch({ type: "setSkuRows", rows }),
        ensureDraft,
        saveBasic,
        saveSkus,
        submit,
        submitting,
        creating,
        hydrated,
    }
}
