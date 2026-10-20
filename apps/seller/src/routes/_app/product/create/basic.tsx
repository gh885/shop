import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ProductEditor } from "#/domains/product"
import { useShop } from "#/domains/shop"

interface BasicSearch {
    categoryId?: string
    productId?: string
}

export const Route = createFileRoute("/_app/product/create/basic")({
    validateSearch: (search: Record<string, unknown>): BasicSearch => ({
        categoryId: typeof search.categoryId === "string" ? search.categoryId : undefined,
        productId: typeof search.productId === "string" ? search.productId : undefined,
    }),
    component: NewProductBasicStep,
})

function NewProductBasicStep() {
    const shop = useShop()
    const navigate = useNavigate()
    const { categoryId, productId } = Route.useSearch()
    if (!categoryId)
        return (
            <Navigate
                to="/product/create/category"
                search={{}}
                replace
            />
        )
    return (
        <ProductEditor
            shopId={shop.id}
            categoryId={categoryId}
            productId={productId}
            onCreated={(newProductId) =>
                void navigate({
                    to: "/product/create/basic",
                    search: { categoryId, productId: newProductId },
                    replace: true,
                    // 只把当前会话的新 ID 写回 URL，不离开编辑器，也不丢弃任何修改。
                    ignoreBlocker: true,
                })
            }
            onFinished={() => void navigate({ to: "/product/list", search: { page: 1, size: 10 } })}
            onSwitchCategory={() => void navigate({ to: "/product/create/category", search: {} })}
        />
    )
}
