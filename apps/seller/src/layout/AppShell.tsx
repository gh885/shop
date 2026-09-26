import { useMemo } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { useT } from "@shop/app-kit"
import { cn } from "@shop/ui-web"

import { PageBreadcrumb, type Crumb } from "#/shared/ui/PageBreadcrumb"
import { AppTopBar } from "./AppTopBar"
import { activeSectionOf, WorkbenchSidebar, type SidebarItem } from "@shop/app-kit"
import { NAV_ITEMS } from "./SidebarMenu"
import { translateSellerNav } from "./nav-i18n"

// 内容区需要大空间的页面：隐藏侧边栏与面包屑，顶栏收成「品牌 + 页名 + 动作」，内容通栏铺满
const FULL_WIDTH_PATHS = new Set(["/product/create/category", "/product/create/basic"])

/** 由 pathname 在菜单树中找命中叶子的 label（用于页面标题 / 面包屑当前页） */
// fallow-ignore-next-line complexity
function leafLabelOf(items: SidebarItem[], pathname: string): string {
    for (const item of items) {
        if (!("sections" in item)) continue
        for (const section of item.sections) {
            const hit = section.items.find((leaf) => leaf.to === pathname)
            if (hit) return hit.label
        }
    }
    return "工作台"
}

/** 由 pathname 推导面包屑：[首页, 一级栏目, 当前页] */
function crumbsOf(items: SidebarItem[], pathname: string, homeLabel: string): Crumb[] {
    const section = activeSectionOf(items, pathname)
    if (!section) return [{ label: homeLabel, to: "/" }]
    return [
        { label: homeLabel, to: "/" },
        { label: section.label },
        { label: leafLabelOf(items, pathname) },
    ]
}

/** 工作台壳（千牛式）：蓝灰 canvas 画布上，通栏透明顶栏 + 一级轨，
    「二级面板 + 内容」合并为一张白色浮面（大圆角、无分割线）。
    侧边栏选中态（一级分组 + 二级叶子）完全由 pathname 两段推导，路径即状态，
    天然支持刷新保持 / 前进后退 / 深链分享，无任何显式状态。
    fullWidth 页（发布流程）例外：改用窗口级滚动，顶栏不吸顶随内容滚走，
    页面内的锚点页签才能吸到视口最顶。 */
// fallow-ignore-next-line complexity
export function AppShell() {
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateSellerNav(NAV_ITEMS, t), [t])
    const fullWidth = FULL_WIDTH_PATHS.has(pathname)
    const title = leafLabelOf(items, pathname)

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
                                crumbs={crumbsOf(items, pathname, t("seller.nav.home"))}
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
