import { useEffect } from "react"
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { Heart, MapPin, ReceiptText, Shield, UserRound } from "lucide-react"

import NavMenu, { type NavMenuItem } from "#/widgets/NavMenu"
import { AccountHeader } from "#/widgets/account"

/**
 * 个人中心侧边栏菜单（数据驱动）。
 * 每项声明 key→label→icon→to，activeKey 由 route path 前缀匹配、handleSelect 由 to 派生，
 * 新增菜单只改这一个数组，不再散落三处 if-else。
 */
const MENU_ITEMS: (NavMenuItem & { to: string })[] = [
    {
        key: "orders",
        label: "我的订单",
        icon: <ReceiptText className="size-4" />,
        to: "/account/orders",
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

/** 个人中心布局：侧边栏 NavMenu + 内容区（Outlet），子路由自动嵌套 */
function AccountLayout() {
    const location = useLocation()
    const navigate = useNavigate()

    // 直接访问 /account（未命中子路由）时默认落到收货地址
    useEffect(() => {
        if (location.pathname === "/account" || location.pathname === "/account/") {
            void navigate({ to: "/account/address", replace: true })
        }
    }, [location.pathname, navigate])

    // 当前高亮项由 route path 前缀匹配（越长越要精确，订单/地址/收藏路径互不前缀包含）
    const activeKey = MENU_ITEMS.find((m) => location.pathname.startsWith(m.to))?.key ?? ""

    function handleSelect(key: string) {
        const item = MENU_ITEMS.find((m) => m.key === key)
        if (item) void navigate({ to: item.to })
    }

    return (
        <div className="flex flex-1 flex-col">
            {/* 页头：品牌 + 搜索框，与站点头部同宽版心 */}
            <AccountHeader />

            {/* 主体：与站点头部同宽 1486px，保持整体版心一致 */}
            <div className="mx-auto flex w-full max-w-[1486px] flex-1 gap-6 px-6 py-8">
                <div className="shrink-0 self-start">
                    <NavMenu
                        items={MENU_ITEMS}
                        activeKey={activeKey}
                        onSelect={handleSelect}
                        widthClass="w-[166px]"
                    />
                </div>
                <main className="min-w-0 flex-1">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
