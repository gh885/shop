import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { ACCOUNT_MANAGE_PERMISSION } from "#/account/constants"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS } from "./nav"

export function AppSidebar() {
    const { pathname } = useLocation()
    const { data: me } = useMe()
    const items = me?.permissions.includes(ACCOUNT_MANAGE_PERMISSION)
        ? NAV_ITEMS
        : NAV_ITEMS.filter((item) => item.key !== "account")
    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
        />
    )
}
