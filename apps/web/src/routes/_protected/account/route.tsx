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

/**
 * 个人中心侧边栏菜单（数据驱动，路径驱动）。
 * 每项声明 key→labelKey→icon→to，activeKey 由 route path 前缀匹配；
 * labelKey 是 catalog 字面量（渲染期翻译），叶子由 MenuTree 渲染为 Link(to) 直接跳转。
 * 新增菜单只改这一个数组。
 */
// 收窄到无参的 menu.* 键：整条 account 联合里有带 ICU 参数的 key，
// 联合进 t 的泛型位会把参数要求也带上，无参调用就会「Expected 2 arguments」红。
type MenuLabelKey = Extract<WebMessageKey, `web.account.menu.${string}`>

type AccountMenuItem = {
    key: string
    labelKey: MenuLabelKey
    icon: ReactNode
    to: string
}

const MENU_ITEMS: AccountMenuItem[] = [
    {
        key: "orders",
        labelKey: "web.account.menu.orders",
        icon: <ReceiptText className="size-4" />,
        to: "/account/orders",
    },
    {
        key: "coupons",
        labelKey: "web.account.menu.coupons",
        icon: <TicketPercent className="size-4" />,
        to: "/account/coupons",
    },
    {
        key: "address",
        labelKey: "web.account.menu.address",
        icon: <MapPin className="size-4" />,
        to: "/account/address",
    },
    {
        key: "favorites",
        labelKey: "web.account.menu.favorites",
        icon: <Heart className="size-4" />,
        to: "/account/favorites",
    },
    {
        key: "profile",
        labelKey: "web.account.menu.profile",
        icon: <UserRound className="size-4" />,
        to: "/account/profile",
    },
    {
        key: "security",
        labelKey: "web.account.menu.security",
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

/** 个人中心布局：侧边栏菜单 + 内容区（Outlet），子路由自动嵌套 */
function AccountLayout() {
    const t = useT()
    const location = useLocation()
    const navigate = useNavigate()

    // 直接访问 /account（未命中子路由）时默认落到收货地址
    useEffect(() => {
        if (location.pathname === "/account" || location.pathname === "/account/") {
            void navigate({ to: "/account/address", replace: true })
        }
    }, [location.pathname, navigate])

    // 当前高亮项由 route path 前缀匹配（订单/地址/收藏/资料/安全路径互不前缀包含）
    const activeKey = MENU_ITEMS.find((m) => location.pathname.startsWith(m.to))?.key ?? ""
    const items: MenuLeaf[] = MENU_ITEMS.map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(labelKey),
    }))

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader title={t("web.route.title.account")} />

            <div className="mx-auto flex w-full max-w-page flex-1 gap-6 px-6 py-8">
                <div className="shrink-0 self-start">
                    <SidebarProvider className="contents">
                        <nav
                            aria-label={t("web.account.layout.navAria")}
                            className="w-41.5 bg-sidebar p-2 text-sidebar-foreground"
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
