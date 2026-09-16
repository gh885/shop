import { cn } from "@shop/ui-web"
import { activeSectionOf, type SidebarItem } from "./navigation"
import { SidebarRail } from "./sidebar-rail"
import { SidebarPanel } from "./sidebar-panel"

/** 两端共用的双列侧栏；菜单与当前路径由应用装配。 */
export function WorkbenchSidebar({
    items,
    pathname,
    className,
}: {
    items: SidebarItem[]
    pathname: string
    className?: string
}) {
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
