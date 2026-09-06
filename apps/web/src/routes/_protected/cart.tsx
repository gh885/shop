import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ShoppingCart } from "lucide-react"

import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"

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
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                <CartContent />
            </div>
        </>
    )
}

function CartList() {
    const navigate = useNavigate()
    const { data: items, isPending } = useCartItems()
    const groups = groupByShop(items ?? [])
    if (isPending) {
        // 首次加载：按分组卡片形状占位（头部行 + 两行商品）
        return (
            <div className="space-y-4">
                {[0, 1].map((g) => (
                    <div
                        key={g}
                        className="overflow-hidden rounded-2xl border border-border/60"
                    >
                        <Skeleton className="h-12 rounded-none" />
                        <div className="space-y-px">
                            {[0, 1].map((r) => (
                                <Skeleton
                                    /* eslint-disable-next-line react/no-array-index-key */
                                    key={r}
                                    className="h-20 rounded-none"
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )
    }
    if (groups.length === 0) {
        return (
            <Empty className="py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <ShoppingCart />
                    </EmptyMedia>
                    <EmptyTitle>购物车还是空的</EmptyTitle>
                    <EmptyDescription>去逛逛，把心仪好物带回家。</EmptyDescription>
                    <Button
                        className="mt-2"
                        onClick={() => void navigate({ to: "/" })}
                    >
                        去逛逛
                    </Button>
                </EmptyHeader>
            </Empty>
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
