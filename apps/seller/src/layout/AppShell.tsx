import { useMemo } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { cn } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { PageBreadcrumb } from "#/shared/ui/PageBreadcrumb"
import { AppTopBar } from "./AppTopBar"
import { translateSidebarItems, WorkbenchSidebar } from "@shop/app-kit/shell"
import { NAV_SOURCE_ITEMS } from "./SidebarMenu"
import { crumbsOf, FULL_WIDTH_PATHS, leafLabelOf } from "./nav"

export function AppShell() {
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateSidebarItems(NAV_SOURCE_ITEMS, t), [t])
    const fullWidth = FULL_WIDTH_PATHS.has(pathname)
    const labels = { home: t("nav.home"), fallback: t("layout.workbench") }
    const title = leafLabelOf(items, pathname, labels.fallback)

    return (
        <div className={cn("flex w-full flex-col bg-canvas", fullWidth ? "min-h-svh" : "h-svh")}>
            <AppTopBar
                title={title}
                minimal={fullWidth}
                sticky={!fullWidth}
            />
            <div className="flex min-h-0 flex-1">
                {!fullWidth && (
                    <WorkbenchSidebar
                        items={items}
                        pathname={pathname}
                    />
                )}
                <div
                    className={cn(
                        "flex min-w-0 flex-1 bg-background",
                        !fullWidth && "rounded-tl-2xl",
                    )}
                >
                    <main
                        className={cn(
                            "min-w-0 flex-1 p-6",
                            fullWidth ? "bg-canvas" : "overflow-auto",
                        )}
                    >
                        {!fullWidth && (
                            <PageBreadcrumb
                                crumbs={crumbsOf(items, pathname, labels)}
                                className="mb-4"
                            />
                        )}
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    )
}
