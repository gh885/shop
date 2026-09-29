import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { useT } from "#/locales/use-t"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS, visibleNavGroups } from "./nav"
import { translateAdminNav } from "./nav-i18n"

/** 权限裁剪与 NAV_ITEMS 一起住在 ./nav（表与判定分两处就会各改一处）；这里只管翻译与渲染 */
export function AppSidebar() {
    const t = useT()
    const { pathname } = useLocation()
    const { data: me } = useMe()
    const translatedItems = useMemo(() => translateAdminNav(NAV_ITEMS, t), [t])
    const items = visibleNavGroups(translatedItems, me?.permissions)

    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
        />
    )
}
