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

import { ShopGroupCard, Settlement, Toolbar, groupByShop, cartItemsOptions } from "#/domains/cart"
import { DetailColumns } from "#/shared/ui/DetailColumns"
import { SearchHeader } from "#/shared/ui/SearchHeader"
import { useT } from "#/locales/use-t"
import { translateWeb } from "#/locales"
import { useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_authenticated/cart")({
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

function CartSkeleton() {
    const t = useT("cart")
    return (
        <>
            <SearchHeader title={t("cart.page.title")} />
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                <div className="space-y-4">
                    {[0, 1].map((g) => (
                        <div
                            key={g}
                            className="overflow-hidden rounded-lg border border-border/60"
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
    return (
        <>
            <SearchHeader title={t("cart.page.title")} />
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                <CartContent />
            </div>
        </>
    )
}

function CartList() {
    const t = useT("cart")
    const navigate = useNavigate()
    const items = useSuspenseQuery(cartItemsOptions).data
    const groups = groupByShop(items)
    if (groups.length === 0) {
        return (
            <Empty className="py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <ShoppingCart />
                    </EmptyMedia>
                    <EmptyTitle>{t("cart.empty.title")}</EmptyTitle>
                    <EmptyDescription>{t("cart.empty.description")}</EmptyDescription>
                    <Button
                        className="mt-2"
                        onClick={() => void navigate({ to: "/" })}
                    >
                        {t("cart.empty.action")}
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
