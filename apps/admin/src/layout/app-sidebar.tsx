import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { useT } from "#/locales/use-t"
import { useAuthStatus } from "#/shared/lib/api"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS, visibleNavGroups } from "./nav"
import { translateAdminNav } from "./nav-i18n"

/** 权限裁剪与 NAV_ITEMS 一起住在 ./nav（表与判定分两处就会各改一处）；这里只管翻译与渲染 */
export function AppSidebar() {
    const t = useT()
    const { pathname } = useLocation()
    const status = useAuthStatus()
    const { data: me, isError } = useMe()
    const translatedItems = useMemo(() => translateAdminNav(NAV_ITEMS, t), [t])
    const items = visibleNavGroups(translatedItems, me?.permissions)
    /**
     * 「已登录、首份 me 还没落地」才是加载态：未登录时 me 压根不发请求，那不该挂骨架。
     * me 失败（retry:false）按无权限视图渲染，与改动前一致，所以不存在卡住的骨架。
     *
     * 为什么值得为它单独占位：菜单条目数与二级列的有无都由权限决定。等不到就渲染，
     * 权限到位那一刻补一级轨条目 + 插进 176px 的二级列，内容区被整体推走（实测审核台 CLS 0.630）。
     */
    const pending = status === "authed" && me === undefined && !isError

    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
            pending={pending}
        />
    )
}
