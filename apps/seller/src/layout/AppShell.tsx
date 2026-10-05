import { useMemo } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { cn } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { PageBreadcrumb } from "#/shared/ui/PageBreadcrumb"
import { AppTopBar } from "./AppTopBar"
import { translateSidebarItems, WorkbenchSidebar } from "@shop/app-kit/shell"
import { NAV_SOURCE_ITEMS } from "./SidebarMenu"
import { crumbsOf, FULL_WIDTH_PATHS, leafLabelOf } from "./nav"

/** 工作台壳（千牛式）：蓝灰 canvas 画布上，通栏透明顶栏 + 一级轨，
    「二级面板 + 内容」合并为一张白色浮面（大圆角、无分割线）。
    侧边栏选中态（一级分组 + 二级叶子）完全由 pathname 两段推导，路径即状态，
    天然支持刷新保持 / 前进后退 / 深链分享，无任何显式状态。
    fullWidth 页（发布流程）例外：改用窗口级滚动，顶栏不吸顶随内容滚走，
    页面内的锚点页签才能吸到视口最顶。 */
export function AppShell() {
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateSidebarItems(NAV_SOURCE_ITEMS, t), [t])
    const fullWidth = FULL_WIDTH_PATHS.has(pathname)
    // 菜单树点不到的路径（分组根、未知地址）落到工作台名；文案从 t() 来，不在 nav.ts 里写死
    const labels = { home: t("seller.nav.home"), fallback: t("seller.layout.workbench") }
    const title = leafLabelOf(items, pathname, labels.fallback)

    return (
        <div className={cn("flex w-full flex-col bg-canvas", fullWidth ? "min-h-svh" : "h-svh")}>
            <AppTopBar
                title={title}
                minimal={fullWidth}
                sticky={!fullWidth}
            />
            <div className="flex min-h-0 flex-1">
                {/* 侧边栏两列都落在 canvas 画布上（蓝灰），内容才进白色浮面 */}
                {!fullWidth && (
                    <WorkbenchSidebar
                        items={items}
                        pathname={pathname}
                    />
                )}
                {/* 白色浮面：只有内容，rounded-tl 浮于 canvas */}
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
