import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { NAV_ITEMS } from "./SidebarMenu"

export function Sidebar({ className }: { className?: string }) {
    const { pathname } = useLocation()
    return (
        <WorkbenchSidebar
            items={NAV_ITEMS}
            pathname={pathname}
            className={className}
        />
    )
}
