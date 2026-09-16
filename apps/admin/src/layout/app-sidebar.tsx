import { useLocation } from "@tanstack/react-router"
import { WorkbenchSidebar } from "@shop/app-kit"
import { NAV_ITEMS } from "./nav"

export function AppSidebar() {
    const { pathname } = useLocation()
    return (
        <WorkbenchSidebar
            items={NAV_ITEMS}
            pathname={pathname}
        />
    )
}
