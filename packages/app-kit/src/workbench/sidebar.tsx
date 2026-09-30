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
     * 菜单数据（通常是权限）还没到：两列照常占位、列内出骨架。
     *
     * 默认 false —— 静态菜单的应用（seller）永远用不到它；需要按权限裁剪菜单的应用（admin）必须传，
     * 否则首帧是「只有一级轨」的窄壳，数据落地才插出二级列，内容区被整体推走（审核台实测 CLS 0.630，
     * 一级轨同时补条目，修法与实测见 perf/README「两条位移：定性 → 修掉 → 复测」）。
     *
     * 传 true 时按「当前路由有二级列」占位：二级列的有无被当成路由的结构事实，而不是权限的函数——
     * 只有全部分组都是入口（admin）的应用成立，装配侧要钉住这条不变量。
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
