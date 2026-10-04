import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ProductEditor } from "#/product"
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

/** 路由只裁决身份与去向；编辑会话全部归 ProductEditor。 */
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
