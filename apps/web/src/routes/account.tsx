import { useEffect } from "react"
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { MapPin } from "lucide-react"

import NavMenu, { type NavMenuItem } from "#/widgets/NavMenu"
import { requireAuth } from "#/shared/api/auth"

/** 个人中心侧边栏菜单（目前只有收货地址一项，后续扩展） */
const MENU_ITEMS: NavMenuItem[] = [
    {
        key: "address",
        label: "收货地址",
        icon: <MapPin className="size-4" />,
    },
]

export const Route = createFileRoute("/account")({
    beforeLoad: () => requireAuth(),
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
    const activeKey = location.pathname.startsWith("/account/address") ? "address" : ""

    function handleSelect(key: string) {
        if (key === "address") void navigate({ to: "/account/address" })
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
            <div className="shrink-0 self-start">
                <NavMenu
                    items={MENU_ITEMS}
                    activeKey={activeKey}
                    onSelect={handleSelect}
                />
            </div>
            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
        </div>
    )
}
