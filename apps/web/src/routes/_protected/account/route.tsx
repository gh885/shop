import { useEffect } from "react"
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
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
 * 每项声明 key→label→icon→to，activeKey 由 route path 前缀匹配；
 * 叶子由 MenuTree 渲染为 Link(to) 直接跳转。新增菜单只改这一个数组。
 */
const MENU_ITEMS: MenuLeaf[] = [
    {
        key: "orders",
        label: "我的订单",
        icon: <ReceiptText className="size-4" />,
        to: "/account/orders",
    },
    {
        key: "coupons",
        label: "我的优惠券",
        icon: <TicketPercent className="size-4" />,
        to: "/account/coupons",
    },
    {
        key: "address",
        label: "收货地址",
        icon: <MapPin className="size-4" />,
        to: "/account/address",
    },
    {
        key: "favorites",
        label: "我的收藏",
        icon: <Heart className="size-4" />,
        to: "/account/favorites",
    },
    {
        key: "profile",
        label: "个人资料",
        icon: <UserRound className="size-4" />,
        to: "/account/profile",
    },
    {
        key: "security",
        label: "安全设置",
        icon: <Shield className="size-4" />,
        to: "/account/security",
    },
]

export const Route = createFileRoute("/_protected/account")({
    component: AccountLayout,
    head: () => ({
        meta: [{ title: "个人中心 - Shop" }],
    }),
})

/** 个人中心布局：侧边栏菜单 + 内容区（Outlet），子路由自动嵌套 */
function AccountLayout() {
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

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader title="个人中心" />

            <div className="mx-auto flex w-full max-w-page flex-1 gap-6 px-6 py-8">
                <div className="shrink-0 self-start">
                    <SidebarProvider className="contents">
                        <nav
                            aria-label="导航菜单"
                            className="w-41.5 bg-sidebar p-2 text-sidebar-foreground"
                        >
                            <SidebarMenu className="gap-0.5">
                                <MenuTree
                                    items={MENU_ITEMS}
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
