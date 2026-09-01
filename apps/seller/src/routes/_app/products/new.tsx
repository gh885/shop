import { useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, Store } from "lucide-react"

import { toApiError } from "@shop/api"
import type { ApiError, SkuUpdateItem } from "@shop/api"
import type { SkuResponse } from "@shop/api/sdk"

import { CategoryStep, PublishBasicStep, type BasicStepValues, type SubmitMode } from "#/products"
import { productApi, type SpecSelection } from "#/shared/lib/api"
import { useCurrentShop } from "#/shared/lib/shop"

interface NewProductSearch {
    /** 已选末级类目 id：有值 = 进入第二步（填商品信息），空 = 第一步选类目 */
    categoryId?: string
}

export const Route = createFileRoute("/_app/products/new")({
    validateSearch: (search: Record<string, unknown>): NewProductSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
    }),
    component: NewProductPage,
})

/** 发布商品：第一步选类目（类目发布后不可改，单独成屏），第二步填商品信息建档 */
function NewProductPage() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const { categoryId } = Route.useSearch()
    const [serverError, setServerError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    // 选值后生成 SKU 网格需要已建草稿的 id；首次建了就缓存
    const draftIdRef = useRef<string | null>(null)

    /** 建草稿（幂等）：首次用到时建档，后续复用 */
    async function ensureDraft(values: BasicStepValues): Promise<string> {
        if (draftIdRef.current) return draftIdRef.current
        const product = await productApi.create(shop!.id, {
            categoryId: categoryId!,
            name: values.name,
            subtitle: values.subtitle || undefined,
            mainImage: values.mainImage || undefined,
        })
        draftIdRef.current = product.id
        return product.id
    }

    /** 生成 SKU 网格：销售信息选值变化时由子组件调用 */
    async function applySpecs(
        values: BasicStepValues,
        selections: SpecSelection[],
    ): Promise<SkuResponse[]> {
        // 生成 SKU 需先建草稿，而建档必填标题；没填就先拦住，给个可操作的提示而不是 422
        if (!values.name.trim()) {
            throw { status: 0, detail: "请先填写商品标题，再配置销售规格" } satisfies ApiError
        }
        const id = await ensureDraft(values)
        return productApi.applySpecs(shop!.id, id, selections)
    }

    /** 提交：建草稿 → 写规格价格库存 → 上架；草稿模式只建档回列表 */
    async function onSubmit(values: BasicStepValues, mode: SubmitMode, skuItems: SkuUpdateItem[]) {
        setServerError(null)
        setSubmitting(true)
        try {
            const id = await ensureDraft(values)
            if (skuItems.length) {
                await productApi.updateSkus(shop!.id, id, skuItems)
            }
            if (mode === "submit" && skuItems.length) {
                // 有规格才算完整：按价上架
                await productApi.publish(shop!.id, id)
                void navigate({ to: "/products", search: { page: 1, size: 10 } })
            } else {
                // 无规格或存草稿：回列表
                void navigate({ to: "/products", search: { page: 1, size: 10 } })
            }
        } catch (e) {
            setServerError(toApiError(e).detail)
        } finally {
            setSubmitting(false)
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

    // 第一步：选类目
    if (!categoryId) {
        return (
            <div className="mx-auto w-full max-w-[1184px]">
                <CategoryStep
                    value={null}
                    onConfirm={(leafId) =>
                        void navigate({ to: ".", search: { categoryId: leafId } })
                    }
                />
            </div>
        )
    }

    // 第二步：填商品信息（类目已在第一步锁定，可回上一步重选）
    return (
        <div className="mx-auto w-full max-w-[1184px]">
            <PublishBasicStep
                categoryId={categoryId}
                submitting={submitting}
                onSwitchCategory={() => void navigate({ to: ".", search: {} })}
                applySpecs={applySpecs}
                onSubmit={onSubmit}
            />
            {serverError ? (
                <p className="flex items-center gap-1.5 pb-4 text-sm text-destructive">
                    <CircleAlert className="size-4" />
                    {serverError}
                </p>
            ) : null}
        </div>
    )
}
