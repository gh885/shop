import { useEffect, useRef, useState } from "react"
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"

import { toApiError } from "@shop/common"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@shop/ui-web"

import { PublishBasicStep, type BasicStepValues, type SubmitMode } from "#/product"
import { useProductDraft } from "#/product/create/basic/use-product-draft"
import { notify } from "@shop/app-kit"
import { useShop } from "#/shop"

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
    const shop = useShop()
    const navigate = useNavigate()
    const shopId = shop.id
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

    // ---- 未保存更改离开提醒 ----
    // onBasicChange 会在表单值每次变化（含回填）时触发：以回填完成后的首个观测值为基线，
    // 其后内容变化即视为脏。hydratedBasic 变化（编辑回填完成）时重置基线，避免把程序性回填误判为用户编辑。
    const [dirty, setDirty] = useState(false)
    const hydratedBasic = draft.hydratedBasic
    const baselineRef = useRef<BasicStepValues | undefined>(undefined)
    const lastHydratedRef = useRef(hydratedBasic)

    function handleBasicChange(values: BasicStepValues) {
        const hydratedChanged = lastHydratedRef.current !== hydratedBasic
        lastHydratedRef.current = hydratedBasic
        if (baselineRef.current === undefined || hydratedChanged) {
            baselineRef.current = values
            return
        }
        if (JSON.stringify(values) !== JSON.stringify(baselineRef.current)) {
            setDirty(true)
        }
    }

    const blocker = useBlocker({
        shouldBlockFn: () => dirty,
        withResolver: true,
    })
    const leaveOpen = blocker.status === "blocked"
    // 关闭页面/刷新兜底（路由内跳转由 blocker 处理）
    useEffect(() => {
        if (!dirty) return
        const handler = (e: BeforeUnloadEvent) => e.preventDefault()
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [dirty])

    // 编辑已有商品时把状态带到发布页（BasicStep 据此决定能否切类目 / 规格是否冻结）；新建无。
    // 类型即 useProductDraft 返回的 ProductStatus | undefined（DraftProductStatus 别名已在重构中删除）
    const editingStatus = draft.productStatus

    // 直接访问缺 categoryId：回第一步
    useEffect(() => {
        if (!categoryId) {
            void navigate({ to: "/product/create/category", search: {} })
        }
    }, [categoryId, navigate])

    async function onSubmit(values: BasicStepValues, mode: SubmitMode) {
        setServerError(undefined)
        try {
            await draft.submit(values, mode)
            // 保存草稿：留在当前页（productId 已由 onCreated 写回 URL，可刷新续编），toast 确认；
            // 提交/入库才跳回列表。保存成功后重置脏标记与基线。
            baselineRef.current = undefined
            setDirty(false)
            if (mode === "draft") {
                notify.success("草稿已保存")
                return
            }
            void navigate({ to: "/product/list", search: { page: 1, size: 10 } })
        } catch (error) {
            setServerError(toApiError(error).detail)
        }
    }

    if (!categoryId) return

    return (
        <div className="mx-auto w-full max-w-narrow">
            <PublishBasicStep
                categoryId={categoryId}
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
                onBasicChange={handleBasicChange}
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

            {/* 未保存更改：拦截路由内跳转（含切类目/侧边栏），确认丢弃才继续 */}
            {leaveOpen ? (
                <AlertDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) blocker.reset()
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>有未保存的更改</AlertDialogTitle>
                            <AlertDialogDescription>
                                离开后当前页面的修改将丢失，确定要离开吗？
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>继续编辑</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                onClick={() => {
                                    setDirty(false)
                                    blocker.proceed()
                                }}
                            >
                                丢弃更改并离开
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : undefined}
        </div>
    )
}
