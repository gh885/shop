import type { ReactNode } from "react"

/** 端内用 linkOptions 校验目标，共享导航只消费路径与查询参数。 */
export interface SidebarTarget {
    to: string
    search?: Record<string, string | number | boolean>
}

export interface SubLeaf extends SidebarTarget {
    key: string
    label: string
}

interface SubSection {
    title: string
    collapsible?: boolean
    items: SubLeaf[]
}

interface SidebarItemBase {
    key: string
    label: string
    icon?: ReactNode
    dividerAfter?: boolean
}

export interface SidebarLeaf extends SidebarItemBase, SidebarTarget {}

export interface SidebarGroup extends SidebarItemBase {
    sections: SubSection[]
}

export type SidebarItem = SidebarLeaf | SidebarGroup

/** 路径段边界匹配，根路径只精确匹配，不把所有页面都算作首页。 */
export function matchesSidebarPath(target: string, pathname: string): boolean {
    return pathname === target || (target !== "/" && pathname.startsWith(`${target}/`))
}

/** 优先匹配分组路径段；同时支持 admin 审核页在 / 等非标准菜单路径。 */
export function activeSectionOf(items: SidebarItem[], pathname: string): SidebarGroup | undefined {
    return (
        items.find(
            (item): item is SidebarGroup =>
                "sections" in item && matchesSidebarPath(`/${item.key}`, pathname),
        ) ??
        items.find(
            (item): item is SidebarGroup =>
                "sections" in item &&
                item.sections.some((section) =>
                    section.items.some((leaf) => matchesSidebarPath(leaf.to, pathname)),
                ),
        )
    )
}
