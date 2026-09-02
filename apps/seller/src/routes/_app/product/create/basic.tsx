import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, Store } from "lucide-react"

import { toApiError } from "@shop/api"

import { PublishBasicStep, type BasicStepValues, type SubmitMode } from "#/products"
import { useProductDraft } from "#/products/create/basic/use-product-draft"
import { useCurrentShop } from "#/shared/lib/shop"

interface BasicSearch {
    /** 已选末级类目 id（第一步确认后跳转带入，必填） */
    categoryId?: string
    /** 草稿 id：进入第二步即建档后写回，刷新/切路由可继续编辑 */
    draftId?: string
}

export const Route = createFileRoute("/_app/product/create/basic")({
    validateSearch: (search: Record<string, unknown>): BasicSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        draftId: typeof search.draftId === "string" ? search.draftId : undefined,
    }),
    component: NewProductBasicStep,
})

/** 发布第二步：填商品信息建档（新建/继续编辑共用）。categoryId 必填，缺失回第一步 */
function NewProductBasicStep() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const shopId = shop?.id
    const { categoryId, draftId } = Route.useSearch()
    const [serverError, setServerError] = useState<string | undefined>()
    const saveBasicTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const draft = useProductDraft({
        shopId,
        categoryId,
        draftId,
        onCreated: (newDraftId) =>
            void navigate({
                to: "/product/create/basic",
                search: { categoryId, draftId: newDraftId },
                replace: true,
            }),
    })

    // 直接访问缺 categoryId：回第一步
    useEffect(() => {
        if (!categoryId) {
            void navigate({ to: "/product/create/category", search: {} })
        }
    }, [categoryId, navigate])

    // 表单字段变化 → 防抖 autosave 基本信息
    const debouncedSaveBasic = (values: BasicStepValues) => {
        clearTimeout(saveBasicTimer.current)
        saveBasicTimer.current = setTimeout(() => void draft.saveBasic(values), 800)
    }

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        try {
            await draft.submit(values, mode)
            void navigate({ to: "/product/list", search: { page: 1, size: 10 } })
        } catch (error) {
            setServerError(toApiError(error).detail)
        }
    }

    if (!shop) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Store className="size-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                    还没有正常营业的店铺，先到「店铺管理」创建或等待审核
                </p>
            </div>
        )
    }

    if (!categoryId) return

    return (
        <div className="mx-auto w-full max-w-narrow">
            <PublishBasicStep
                categoryId={categoryId}
                submitting={draft.submitting}
                creating={draft.creating}
                onSwitchCategory={() =>
                    void navigate({ to: "/product/create/category", search: {} })
                }
                selections={draft.selections}
                skuRows={draft.skuRows}
                onSelectionsChange={draft.setSelections}
                onSkuRowsChange={draft.setSkuRows}
                submit={onSubmit}
                onBasicChange={debouncedSaveBasic}
            />
            {serverError ? (
                <p className="flex items-center gap-1.5 pb-4 text-sm text-destructive">
                    <CircleAlert className="size-4" />
                    {serverError}
                </p>
            ) : undefined}
        </div>
    )
}
