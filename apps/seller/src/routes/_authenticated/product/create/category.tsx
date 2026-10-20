import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { QueryBoundary } from "@shop/app-kit/data"
import { useT } from "#/locales/use-t"
import { CategoryStep } from "#/domains/product"

interface CreateSearch {
    categoryId?: string
    mode?: "search" | "image"
}

export const Route = createFileRoute("/_authenticated/product/create/category")({
    validateSearch: (search: Record<string, unknown>): CreateSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        mode: search.mode === "image" ? "image" : "search",
    }),
    component: NewProductCategoryStep,
})

function NewProductCategoryStep() {
    const navigate = useNavigate()
    const t = useT()
    const { mode, categoryId } = Route.useSearch()

    return (
        <div className="mx-auto w-full max-w-narrow">
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
