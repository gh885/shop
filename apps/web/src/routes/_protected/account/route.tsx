import { useEffect, type ReactNode } from "react"
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import type { WebMessageKey } from "#/locales/messages.gen"
import { Heart, MapPin, ReceiptText, Shield, TicketPercent, UserRound } from "lucide-react"

import {
    MenuTree,
    type MenuLeaf,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@shop/ui-web"
import { SearchHeader } from "#/shared/ui/SearchHeader"

// 收窄到无参的 menu.* 键：整条 account 联合里有带 ICU 参数的 key，
// 联合进 t 的泛型位会把参数要求也带上，无参调用就会「Expected 2 arguments」红。
type MenuLabelKey = Extract<WebMessageKey, `account.menu.${string}`>

type AccountMenuItem = {
    key: string
    labelKey: MenuLabelKey
    icon: ReactNode
    to: string
}

const MENU_ITEMS: AccountMenuItem[] = [
    {
        key: "orders",
        labelKey: "account.menu.orders",
        icon: <ReceiptText className="size-4" />,
        to: "/account/orders",
    },
    {
        key: "coupons",
        labelKey: "account.menu.coupons",
        icon: <TicketPercent className="size-4" />,
        to: "/account/coupons",
    },
    {
        key: "address",
        labelKey: "account.menu.address",
        icon: <MapPin className="size-4" />,
        to: "/account/address",
    },
    {
        key: "favorites",
        labelKey: "account.menu.favorites",
        icon: <Heart className="size-4" />,
        to: "/account/favorites",
    },
    {
        key: "profile",
        labelKey: "account.menu.profile",
        icon: <UserRound className="size-4" />,
        to: "/account/profile",
    },
    {
        key: "security",
        labelKey: "account.menu.security",
        icon: <Shield className="size-4" />,
        to: "/account/security",
    },
]

export const Route = createFileRoute("/_protected/account")({
    component: AccountLayout,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.account", match.context.locale) }],
    }),
})

function AccountLayout() {
    const t = useT()
    const location = useLocation()
    const navigate = useNavigate()

    useEffect(() => {
        if (location.pathname === "/account" || location.pathname === "/account/") {
            void navigate({ to: "/account/address", replace: true })
        }
    }, [location.pathname, navigate])

    const activeKey =
        MENU_ITEMS.find(
            (m) => location.pathname === m.to || location.pathname.startsWith(`${m.to}/`),
        )?.key ?? ""
    const items: MenuLeaf[] = MENU_ITEMS.map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(labelKey),
    }))

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader title={t("account.pageTitle")} />

            <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-6 py-8 lg:flex-row">
                <div className="w-full shrink-0 lg:w-auto lg:self-start">
                    <SidebarProvider className="contents">
                        <nav
                            aria-label={t("account.layout.navAria")}
                            className="bg-sidebar p-2 text-sidebar-foreground lg:w-41.5"
                        >
                            <SidebarMenu className="gap-0.5">
                                <MenuTree
                                    items={items}
                                    activeKey={activeKey}
                                    renderLeaf={(leaf, isActive) => (
                                        <SidebarMenuItem key={leaf.key}>
                                            <SidebarMenuButton
                                                isActive={isActive}
                                                disabled={leaf.disabled}
                                                aria-current={isActive ? "page" : undefined}
                                                render={<Link to={leaf.to} />}
                                            >
                                                {leaf.icon}
                                                <span className="flex-1 truncate">
                                                    {leaf.label}
                                                </span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )}
                                    renderGroup={() => undefined}
                                />
                            </SidebarMenu>
                        </nav>
                    </SidebarProvider>
                </div>
                <main className="min-w-0 flex-1">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
