import { Outlet, useLocation } from "@tanstack/react-router"
import { cn } from "@shop/ui-web"

import { PageBreadcrumb, type Crumb } from "#/shared/ui/PageBreadcrumb"
import { Sidebar } from "./Sidebar"
import { AppTopBar } from "./AppTopBar"
import { activeSectionOf, NAV_ITEMS } from "./SidebarMenu"

// 内容区需要大空间的页面：隐藏侧边栏与面包屑，顶栏收成「品牌 + 页名 + 动作」，内容通栏铺满
const FULL_WIDTH_PATHS = new Set(["/product/create/category", "/product/create/basic"])

/** 由 pathname 在菜单树中找命中叶子的 label（用于页面标题 / 面包屑当前页） */
function leafLabelOf(pathname: string): string {
    for (const item of NAV_ITEMS) {
        if (!item.sections) continue
        for (const section of item.sections) {
            const hit = section.items.find((leaf) => leaf.to === pathname)
            if (hit) return hit.label
        }
    }
    return "工作台"
}

/** 由 pathname 推导面包屑：[首页, 一级栏目, 当前页] */
function crumbsOf(pathname: string): Crumb[] {
    const section = activeSectionOf(NAV_ITEMS, pathname)
    if (!section) return [{ label: "首页", to: "/" }]
    return [{ label: "首页", to: "/" }, { label: section.label }, { label: leafLabelOf(pathname) }]
}

/** 工作台壳（千牛式）：蓝灰 canvas 画布上，通栏透明顶栏 + 一级轨，
    「二级面板 + 内容」合并为一张白色浮面（大圆角、无分割线）。
    侧边栏选中态（一级分组 + 二级叶子）完全由 pathname 两段推导，路径即状态，
    天然支持刷新保持 / 前进后退 / 深链分享，无任何显式状态。 */
export function AppShell() {
    const { pathname } = useLocation()
    const fullWidth = FULL_WIDTH_PATHS.has(pathname)
    const title = leafLabelOf(pathname)

    return (
        <div className="flex h-svh w-full flex-col bg-canvas">
            <AppTopBar
                title={title}
                minimal={fullWidth}
            />
            <div className="flex min-h-0 flex-1">
                {/* 侧边栏两列都落在 canvas 画布上（蓝灰），内容才进白色浮面 */}
                {!fullWidth && <Sidebar />}
                {/* 白色浮面：只有内容，rounded-tl 浮于 canvas */}
                <div
                    className={cn(
                        "flex min-w-0 flex-1 bg-background",
                        !fullWidth && "rounded-tl-2xl",
                    )}
                >
                    <main
                        className={cn("min-w-0 flex-1 overflow-auto p-6", fullWidth && "bg-canvas")}
                    >
                        {!fullWidth && (
                            <PageBreadcrumb
                                crumbs={crumbsOf(pathname)}
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
