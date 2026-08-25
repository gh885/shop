import { createFileRoute } from "@tanstack/react-router"

import { CartProvider, useCart } from "#/features/cart/cart-provider"
import { requireAuth, useAuthGuard } from "#/shared/api/auth"
import { DetailColumns } from "#/shared/ui/detail-columns"
import { CartHeader } from "#/widgets/cart/cart-header"
import { CartSettlement } from "#/widgets/cart/cart-settlement"
import { CartShopGroupCard } from "#/widgets/cart/cart-shop-group"
import { CartToolbar } from "#/widgets/cart/cart-toolbar"

export const Route = createFileRoute("/cart")({
    beforeLoad: () => requireAuth(),
    component: CartPage,
    head: () => ({ meta: [{ title: "购物车 - Shop" }] }),
})

function CartPage() {
    // SSR 直访 /cart 时 beforeLoad 无法裁决登录态（refresh cookie 只在浏览器端刷新），
    // 用客户端守卫兜底：未登录拉起登录 Dialog 并跳回首页，避免先发出一串 401 请求。
    useAuthGuard()

    // 整页包一个 CartProvider：列表分组、选中、金额等派生状态与业务逻辑都在 useCart() 里。
    return (
        <CartProvider>
            <CartHeader />
            {/* 左滚右停：左栏（工具栏+商品列表）随页面滚动，右栏结算明细吸顶 */}
            <div className="mx-auto w-full max-w-[1486px] px-6 pb-10">
                <CartContent />
            </div>
        </CartProvider>
    )
}

function CartList() {
    const { groups, isPending } = useCart()
    if (isPending) {
        return <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
    }
    if (groups.length === 0) {
        return (
            <p className="py-16 text-center text-sm text-muted-foreground">
                购物车还是空的，去逛逛吧
            </p>
        )
    }
    return groups.map((group) => (
        <CartShopGroupCard
            key={group.shopId}
            group={group}
        />
    ))
}

function CartContent() {
    return (
        <DetailColumns
            rightWidth="360px"
            left={
                <div className="min-h-full rounded-2xl bg-background p-6">
                    <CartToolbar />
                    <CartList />
                </div>
            }
            right={<CartSettlement />}
        />
    )
}
