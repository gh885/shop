import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { QueryBoundary } from "@shop/app-kit/data"
import { useT } from "#/locales/use-t"
import { CategoryStep } from "#/domains/product/create/category/CategoryStep"

interface CreateSearch {
    categoryId?: string
}

export const Route = createFileRoute("/_authenticated/product/create/category")({
    validateSearch: (search: Record<string, unknown>): CreateSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
    }),
    component: NewProductCategoryStep,
})

function NewProductCategoryStep() {
    const navigate = useNavigate()
    const t = useT()
    const { categoryId } = Route.useSearch()

    return (
        <div className="mx-auto w-full max-w-narrow">
            <QueryBoundary fallback={t("product.create.loadFailed")}>
                <CategoryStep
                    value={categoryId}
                    onConfirm={(leafId) =>
                        void navigate({
                            to: "/product/create/basic",
                            search: { categoryId: leafId },
                            replace: true,
                        })
                    }
                />
            </QueryBoundary>
        </div>
    )
}
