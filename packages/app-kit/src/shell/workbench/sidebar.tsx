import { cn } from "@shop/ui-web"
import { activeSectionOf, type SidebarItem } from "./navigation"
import { SidebarRail, SidebarRailSkeleton } from "./sidebar-rail"
import { SidebarPanel, SidebarPanelSkeleton } from "./sidebar-panel"

/** 两端共用的双列侧栏；菜单与当前路径由应用装配。 */
export function WorkbenchSidebar({
    items,
    pathname,
    className,
    pending = false,
}: {
    items: SidebarItem[]
    pathname: string
    className?: string
    /**
     * 菜单数据（通常是权限）还没到：两列照常占位、列内出骨架。默认 false；按权限裁剪菜单的应用（admin）必须传，否则首帧只有窄壳、数据落地插出二级列把内容区推走（CLS 修法见 perf/README）
     * 传 true 按「当前路由有二级列」占位：把它当路由结构事实而非权限函数，仅对全部分组皆入口的应用成立，装配侧钉住这条不变量
     */
    pending?: boolean
}) {
    if (pending)
        return (
            <div className={cn("flex min-h-0", className)}>
                <SidebarRailSkeleton />
                <SidebarPanelSkeleton />
            </div>
        )

    return (
        <div className={cn("flex min-h-0", className)}>
            <SidebarRail
                items={items}
                pathname={pathname}
            />
            <SidebarPanel
                shown={activeSectionOf(items, pathname)}
                pathname={pathname}
            />
        </div>
    )
}
