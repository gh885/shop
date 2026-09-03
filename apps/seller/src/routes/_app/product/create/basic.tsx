import { useCallback, useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, Store } from "lucide-react"

import { toApiError } from "@shop/api"
import { Button } from "@shop/ui-web"

import { PublishBasicStep, type BasicStepValues, type SubmitMode } from "#/products"
import { useProductDraft, type DraftProductStatus } from "#/products/create/basic/use-product-draft"
import { useCurrentShop } from "#/shared/lib/shop"

interface BasicSearch {
    /** 已选末级类目 id（第一步确认后跳转带入，必填） */
    categoryId?: string
    /** 商品 id：新建后点保存/提交回写；编辑已有商品（草稿/仓库中/已发布）由列表页带入，刷新可续编 */
    productId?: string
}

export const Route = createFileRoute("/_app/product/create/basic")({
    validateSearch: (search: Record<string, unknown>): BasicSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        productId: typeof search.productId === "string" ? search.productId : undefined,
    }),
    component: NewProductBasicStep,
})

/** 发布第二步：填商品信息建档（新建/继续编辑共用）。categoryId 必填，缺失回第一步 */
function NewProductBasicStep() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const shopId = shop?.id
    const { categoryId, productId } = Route.useSearch()
    const [serverError, setServerError] = useState<string | undefined>()

    const draft = useProductDraft({
        shopId,
        categoryId,
        productId,
        onCreated: (newProductId) =>
            void navigate({
                to: "/product/create/basic",
                search: { categoryId, productId: newProductId },
                replace: true,
            }),
    })

    // 编辑已有商品时把状态带到发布页（BasicStep 据此决定能否切类目 / 规格是否冻结）；新建无
    const editingStatus: DraftProductStatus | undefined = draft.productStatus

    // 直接访问缺 categoryId：回第一步
    useEffect(() => {
        if (!categoryId) {
            void navigate({ to: "/product/create/category", search: {} })
        }
    }, [categoryId, navigate])

    // 显式保存模式：不再监听字段变化自动落库。（BasicStep 的 onBasicChange 上报未来扩展用，此处置空即不写库）
    const NOOP_BASIC_CHANGE = useCallback(() => {}, [])

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        try {
            await draft.submit(values, mode)
            // 保存草稿：留在当前页（productId 已由 onCreated 写回 URL，可刷新续编）；提交/入库才跳回列表。
            if (mode === "draft") return
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
                shopId={shopId!}
                categoryId={categoryId}
                productId={productId}
                productStatus={editingStatus}
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
                onBasicChange={NOOP_BASIC_CHANGE}
                initialBasic={draft.hydratedBasic}
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
