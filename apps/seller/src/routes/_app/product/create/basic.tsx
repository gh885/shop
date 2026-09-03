import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, Store } from "lucide-react"

import { toApiError } from "@shop/api"
import { Button } from "@shop/ui-web"

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
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Store className="size-7" />
                </div>
                <div className="space-y-1">
                    <p className="font-medium">还没有正常营业的店铺</p>
                    <p className="text-sm text-muted-foreground">
                        创建店铺或等待审核通过后，再来发布商品
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => void navigate({ to: "/shop/list" })}
                >
                    去店铺管理
                </Button>
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
                /* 提交失败：浮在底部操作条正上方，与触发按钮保持视觉关联 */
                <div
                    role="alert"
                    className="fixed inset-x-0 bottom-16 z-30 px-6"
                >
                    <p className="mx-auto flex w-full max-w-narrow items-center gap-2 rounded-lg bg-destructive-subtle px-4 py-2.5 text-sm text-destructive-subtle-foreground shadow-md">
                        <CircleAlert className="size-4 shrink-0" />
                        {serverError}
                    </p>
                </div>
            ) : undefined}
        </div>
    )
}
