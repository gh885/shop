import { createFileRoute } from "@tanstack/react-router"

import { ShopGroupCard, Settlement, Toolbar, groupByShop, useCartItems } from "#/cart"
import { DetailColumns } from "#/shared/ui/DetailColumns"
import { SearchHeader } from "#/shared/ui/SearchHeader"

export const Route = createFileRoute("/_protected/cart")({
    component: CartPage,
    head: () => ({ meta: [{ title: "购物车 - Shop" }] }),
})

function CartPage() {
    // 登录守卫由 _protected layout 统一负责（beforeLoad 裁决 + authed 后才渲染子路由）
    return (
        <>
            <SearchHeader title="购物车" />
            {/* 左滚右停：左栏（工具栏+商品列表）随页面滚动，右栏结算明细吸顶 */}
            <div className="mx-auto w-full max-w-(--container-page) px-6 pb-10">
                <CartContent />
            </div>
        </>
    )
}

function CartList() {
    const { data: items, isPending } = useCartItems()
    const groups = groupByShop(items ?? [])
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
        <ShopGroupCard
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
                    <Toolbar />
                    <CartList />
                </div>
            }
            right={<Settlement />}
        />
    )
}
