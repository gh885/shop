import { useEffect } from "react"
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { Heart, MapPin, ReceiptText } from "lucide-react"

import NavMenu, { type NavMenuItem } from "#/widgets/NavMenu"
import { AccountHeader } from "#/widgets/account"

/** 个人中心侧边栏菜单（收货地址、我的收藏、我的订单等，后续扩展） */
const MENU_ITEMS: NavMenuItem[] = [
    {
        key: "orders",
        label: "我的订单",
        icon: <ReceiptText className="size-4" />,
    },
    {
        key: "address",
        label: "收货地址",
        icon: <MapPin className="size-4" />,
    },
    {
        key: "favorites",
        label: "我的收藏",
        icon: <Heart className="size-4" />,
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

    // 当前高亮项由路由推导（后续增加子页时在此扩展）
    const activeKey = location.pathname.startsWith("/account/orders")
        ? "orders"
        : location.pathname.startsWith("/account/address")
          ? "address"
          : location.pathname.startsWith("/account/favorites")
            ? "favorites"
            : ""

    function handleSelect(key: string) {
        if (key === "orders") void navigate({ to: "/account/orders" })
        if (key === "address") void navigate({ to: "/account/address" })
        if (key === "favorites") void navigate({ to: "/account/favorites" })
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
