import type { ReactNode } from "react"

/** 端内用 linkOptions 校验目标，共享导航只消费路径与查询参数。 */
export interface SidebarTarget {
    to: string
    search?: Record<string, string | number | boolean>
}

/** search 透传：to 宽至 string，路由联合变大后无法收窄到具体 search reducer；匹配性由装配侧 linkOptions 在源头保证，这里只放行运行时形状 */
export const sidebarLinkSearch = (search?: SidebarTarget["search"]) =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上注释：匹配性在数据源头保证，这里只能按运行时形状放行
    search as never

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

/** 已翻译、能直接渲染的菜单树（label / title 是当前语言的句子） */
export type SidebarItem = SidebarLeaf | SidebarGroup

/**
 * 菜单源树：labelKey / titleKey 是 i18n key 不是句子。
 * 与渲染树分开是因为 key 必须在声明处被类型拦住（labelKey: K），合成一个形状就两者都可选、漏填 labelKey 成运行时回退；K 由各端生成的 XMessageKey 实例化，写不存在的 key 是编译错误。
 */
export interface SidebarSourceItemBase<K extends string> {
    key: string
    labelKey: K
    icon?: ReactNode
    dividerAfter?: boolean
}

export interface SidebarSourceSection<K extends string> {
    titleKey: K
    collapsible?: boolean
    items: SidebarSourceLeaf<K>[]
}

export interface SidebarSourceLeaf<K extends string>
    extends SidebarSourceItemBase<K>, SidebarTarget {}

export interface SidebarSourceGroup<K extends string> extends SidebarSourceItemBase<K> {
    sections: SidebarSourceSection<K>[]
}

export type SidebarSourceItem<K extends string> = SidebarSourceLeaf<K> | SidebarSourceGroup<K>

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

/**
 * 源树 → 渲染树，每层文案由 labelKey / titleKey 换出；返回新数组，不改原菜单数据。
 * K 由源树 key 位与 t 一起推出：源树声明成别的 key 集合、或传宽到 string 的 t，在这里都过不去。
 */
export function translateSidebarItems<K extends string>(
    items: readonly SidebarSourceItem<K>[],
    t: (key: K) => string,
): SidebarItem[] {
    return items.map((item) => {
        if (!("sections" in item)) {
            return {
                key: item.key,
                to: item.to,
                search: item.search,
                label: t(item.labelKey),
                icon: item.icon,
                dividerAfter: item.dividerAfter,
            }
        }
        return {
            key: item.key,
            label: t(item.labelKey),
            icon: item.icon,
            dividerAfter: item.dividerAfter,
            sections: item.sections.map((section) => ({
                title: t(section.titleKey),
                collapsible: section.collapsible,
                items: section.items.map((leaf) => ({
                    key: leaf.key,
                    to: leaf.to,
                    search: leaf.search,
                    label: t(leaf.labelKey),
                })),
            })),
        }
    })
}
