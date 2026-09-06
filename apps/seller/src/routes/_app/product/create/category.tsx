import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Store } from "lucide-react"

import { Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"

import { CategoryStep } from "#/products"
import { useCurrentShop } from "#/shared/lib/shop"

interface CreateSearch {
    /** 已选末级类目 id：有值则进入第二步（填商品信息），空 = 第一步选类目 */
    categoryId?: string
    /** 发品方式：search（搜索发品）/ image（以图发品，待上线）；未传则默认 search */
    mode?: "search" | "image"
}

export const Route = createFileRoute("/_app/product/create/category")({
    validateSearch: (search: Record<string, unknown>): CreateSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        mode: search.mode === "image" ? "image" : "search",
    }),
    component: NewProductCategoryStep,
})

/** 发布第一步：选类目（类目发布后不可改，单独成屏）。mode/categoryId 由 URL 驱动，刷新可恢复 */
function NewProductCategoryStep() {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const { mode, categoryId } = Route.useSearch()

    if (!shop) {
        return (
            <Empty className="py-24">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Store />
                    </EmptyMedia>
                    <EmptyTitle>还没有正常营业的店铺</EmptyTitle>
                    <EmptyDescription>先到「店铺管理」创建店铺或等待审核通过。</EmptyDescription>
                    <Button
                        variant="outline"
                        className="mt-2"
                        onClick={() => void navigate({ to: "/shop/list" })}
                    >
                        去店铺管理
                    </Button>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="mx-auto w-full max-w-narrow">
            <CategoryStep
                mode={mode ?? "search"}
                onModeChange={(next) =>
                    void navigate({ to: ".", search: { mode: next, categoryId } })
                }
                value={categoryId}
                onConfirm={(leafId) =>
                    void navigate({
                        to: "/product/create/basic",
                        // 函数式 search：移除第一步的 mode（发品方式），只保留 categoryId
                        search: (prev) => {
                            const rest = { ...prev }
                            delete rest.mode
                            return { ...rest, categoryId: leafId }
                        },
                        replace: true,
                    })
                }
            />
        </div>
    )
}
