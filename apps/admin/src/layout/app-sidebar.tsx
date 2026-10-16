import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { translateSidebarItems, WorkbenchSidebar } from "@shop/app-kit/shell"
import { useT } from "#/locales/use-t"
import { useAuthStatus } from "#/shared/lib/api"
import { useMe } from "#/shared/lib/me"
import { NAV_SOURCE_ITEMS, visibleNavGroups } from "./nav"

export function AppSidebar() {
    const t = useT()
    const { pathname } = useLocation()
    const status = useAuthStatus()
    const { data: me, isError } = useMe()
    const translatedItems = useMemo(() => translateSidebarItems(NAV_SOURCE_ITEMS, t), [t])
    const items = visibleNavGroups(translatedItems, me?.permissions)
    const pending = status === "authed" && me === undefined && !isError

    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
            pending={pending}
        />
    )
}
