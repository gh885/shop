import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { ACCOUNT_MANAGE_PERMISSION } from "#/account/constants"
import { COUPON_OPS_PERMISSION } from "#/coupon-ops/constants"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS } from "./nav"

export function AppSidebar() {
    const { pathname } = useLocation()
    const { data: me } = useMe()
    const items = NAV_ITEMS.filter((item) => {
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
