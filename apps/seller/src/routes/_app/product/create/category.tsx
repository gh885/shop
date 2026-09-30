import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { QueryBoundary } from "@shop/app-kit"

import { useT } from "#/locales/use-t"
import { CategoryStep } from "#/product"

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
    const navigate = useNavigate()
    const t = useT()
    const { mode, categoryId } = Route.useSearch()

    return (
        <div className="mx-auto w-full max-w-narrow">
            {/* 类目树是本步的全部原料：失败整块换成错误 UI + 官方 reset（与 web 店条同口径），
                页面外壳与「上一步」不受影响。查询非 suspense 形态，所以不传 pending——
                加载骨架由 CategoryStep 就地渲染 */}
            <QueryBoundary fallback={t("common.loadFailed.categoryTree")}>
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
            </QueryBoundary>
        </div>
    )
}
