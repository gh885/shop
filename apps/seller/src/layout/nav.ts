import { activeSectionOf, type SidebarItem } from "@shop/app-kit"

import type { Crumb } from "#/shared/ui/PageBreadcrumb"

/**
 * 工作台壳的导航规则——「路径 → 页面标题 / 面包屑 / 是否通栏」，不知道 React 的一切。
 *
 * 侧边栏选中态本来就是纯 pathname 推导（路径即状态），这三样是同一条推导的另外三个出口，
 * 所以放在壳外面：可以拿任意菜单树单测，不必挂载 AppShell。
 */

/** 内容区需要大空间的页面：隐藏侧边栏与面包屑，顶栏收成「品牌 + 页名 + 动作」，内容通栏铺满 */
export const FULL_WIDTH_PATHS: ReadonlySet<string> = new Set([
    "/product/create/category",
    "/product/create/basic",
])

/** 菜单树里点不到的路径（一级分组的根、未知地址）用的页面标题 */
export const WORKBENCH_TITLE = "工作台"

/** 由 pathname 在菜单树中找命中叶子的 label（用于页面标题 / 面包屑当前页） */
// fallow-ignore-next-line complexity
export function leafLabelOf(items: SidebarItem[], pathname: string): string {
    for (const item of items) {
        if (!("sections" in item)) continue
        for (const section of item.sections) {
            const hit = section.items.find((leaf) => leaf.to === pathname)
            if (hit) return hit.label
        }
    }
    return WORKBENCH_TITLE
}

/** 由 pathname 推导面包屑：[首页, 一级栏目, 当前页]。一级栏目沿用侧边栏的命中口径（activeSectionOf） */
export function crumbsOf(items: SidebarItem[], pathname: string, homeLabel: string): Crumb[] {
    const section = activeSectionOf(items, pathname)
    if (!section) return [{ label: homeLabel, to: "/" }]
    return [
        { label: homeLabel, to: "/" },
        { label: section.label },
        { label: leafLabelOf(items, pathname) },
    ]
}
