import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { useT, WorkbenchSidebar } from "@shop/app-kit"
import { ACCOUNT_MANAGE_PERMISSION } from "#/account/constants"
import { COUPON_OPS_PERMISSION } from "#/coupon-ops/constants"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS } from "./nav"
import { translateAdminNav } from "./nav-i18n"

export function AppSidebar() {
    const t = useT()
    const { pathname } = useLocation()
    const { data: me } = useMe()
    const translatedItems = useMemo(() => translateAdminNav(NAV_ITEMS, t), [t])
    const items = translatedItems.filter((item) => {
        if (item.key === "account") return me?.permissions.includes(ACCOUNT_MANAGE_PERMISSION)
        if (item.key === "coupon-ops") return me?.permissions.includes(COUPON_OPS_PERMISSION)
        return true
    })
    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
        />
    )
}
