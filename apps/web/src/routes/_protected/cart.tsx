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

import { ShopGroupCard, Settlement, Toolbar, groupByShop, cartItemsOptions } from "#/cart"
import { DetailColumns } from "#/shared/ui/DetailColumns"
import { SearchHeader } from "#/shared/ui/SearchHeader"
import { useT } from "#/locales/use-t"
import { translateWeb } from "#/locales"
import { useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/cart")({
    /**
     * 数据在 loader 里读完再渲染（官方 loader-as-data-source）：
     * 挂起 → `pendingComponent`，失败 → 路由错误页 + 官方重置重试；SSR 阶段服务端拿不到 token，直接跳过。
     * hover intent 预取命中时 loader 直接读缓存，导航不阻塞。
     */
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...cartItemsOptions, staleTime: "static" })
    },
    pendingComponent: CartSkeleton,
    component: CartPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.cart", match.context.locale) }],
    }),
})

/** 挂起占位：按分组卡片形状占位（头部行 + 两行商品），避免加载完成时跳版 */
function CartSkeleton() {
    const t = useT("cart")
    return (
        <>
            <SearchHeader title={t("web.cart.page.title")} />
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                <div className="space-y-4">
                    {[0, 1].map((g) => (
                        <div
                            key={g}
                            className="overflow-hidden rounded-xl border border-border/60"
                        >
                            <Skeleton className="h-12 rounded-none" />
                            <div className="space-y-px">
                                {[0, 1].map((r) => (
                                    <Skeleton
                                        key={r}
                                        className="h-20 rounded-none"
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}

function CartPage() {
    const t = useT("cart")
    // 登录守卫由 _protected layout 统一负责（beforeLoad 裁决 + authed 后才渲染子路由）
    return (
        <>
            <SearchHeader title={t("web.cart.page.title")} />
            {/* 左滚右停：左栏（工具栏+商品列表）随页面滚动，右栏结算明细吸顶 */}
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                <CartContent />
            </div>
        </>
    )
}

function CartList() {
    const t = useT("cart")
    const navigate = useNavigate()
    // 主体数据由 loader 读完（失败已由路由错误页接管），这里只读缓存
    const items = useSuspenseQuery(cartItemsOptions).data
    const groups = groupByShop(items)
    if (groups.length === 0) {
        return (
            <Empty className="py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <ShoppingCart />
                    </EmptyMedia>
                    <EmptyTitle>{t("web.cart.empty.title")}</EmptyTitle>
                    <EmptyDescription>{t("web.cart.empty.description")}</EmptyDescription>
                    <Button
                        className="mt-2"
                        onClick={() => void navigate({ to: "/" })}
                    >
                        {t("web.cart.empty.action")}
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
                <div className="min-h-full rounded-lg bg-background p-6">
                    <Toolbar />
                    <CartList />
                </div>
            }
            right={<Settlement />}
        />
    )
}
