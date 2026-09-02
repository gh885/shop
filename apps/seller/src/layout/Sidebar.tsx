import { useLocation } from "@tanstack/react-router"
import { cn } from "@shop/ui-web"

import { activeSectionOf, NAV_ITEMS } from "./SidebarMenu"
import { SidebarPanel } from "./SidebarPanel"
import { SidebarRail } from "./SidebarRail"

/**
 * 侧边栏（千牛式双列）——纯受控、无内部状态。
 * 选中态完全由当前 pathname 推导（路径即状态）：
 *   一级分组高亮 = pathname 第一段；二级面板显示 = 当前分组；二级叶子高亮 = pathname 第二段。
 * 无 state、无 context、无 nav 参数。
 */
export function Sidebar({ className }: { className?: string }) {
    const { pathname } = useLocation()
    const activeSection = activeSectionOf(NAV_ITEMS, pathname)

    return (
        <div className={cn("flex min-h-0", className)}>
            <SidebarRail
                items={NAV_ITEMS}
                pathname={pathname}
            />
            <SidebarPanel
                shown={activeSection}
                pathname={pathname}
            />
        </div>
    )
}
