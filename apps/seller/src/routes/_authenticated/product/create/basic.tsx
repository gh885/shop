import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useShop } from "#/domains/shop"
import { CreateEditor } from "#/domains/product/create/CreateEditor"

interface BasicSearch {
    categoryId?: string
}

export const Route = createFileRoute("/_authenticated/product/create/basic")({
    validateSearch: (search: Record<string, unknown>): BasicSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
    }),
    component: NewProductBasicStep,
})

function NewProductBasicStep() {
    const shop = useShop()
    const navigate = useNavigate()
    const { categoryId } = Route.useSearch()
    if (!categoryId) {
        return (
            <Navigate
                to="/product/create/category"
                search={{}}
                replace
            />
        )
    }
    return (
        <CreateEditor
            shopId={shop.id}
            categoryId={categoryId}
            onFinished={() => void navigate({ to: "/product/list", search: { size: 10 } })}
            onSwitchCategory={() => void navigate({ to: "/product/create/category", search: {} })}
        />
    )
}
