import type { ReactNode } from "react"

/** 端内用 linkOptions 校验目标，共享导航只消费路径与查询参数。 */
export interface SidebarTarget {
    to: string
    search?: Record<string, string | number | boolean>
}

/**
 * Link 消费 SidebarTarget 时的 search 透传：to 是宽至 string 的存储值，
 * 路由联合变大后 router 无法再把宽 Record 收窄到具体路由的 search reducer，
 * 匹配性由装配侧的 linkOptions 在数据源头保证，这里只放行运行时形状。
 */
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

/** 已翻译、能直接渲染的菜单树（`label` / `title` 是当前语言的句子） */
export type SidebarItem = SidebarLeaf | SidebarGroup

/**
 * 菜单**源**树：`labelKey` / `titleKey` 是 i18n key，不是句子。
 *
 * 为什么源与渲染形状分开：key 必须在**声明处**就被类型拦住（`labelKey: K`），
 * 而 key 到句子的替换只发生在翻译那一步。合成一个形状就只能两者都可选，
 * 漏填 `labelKey` 于是变成运行时回退——那正是 §5.5 口子 2 那四处放宽的成因。
 * K 由各端生成物那份 `XMessageKey` 实例化，于是「往菜单里写一个不存在的 key」是编译错误。
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
 * 把源树翻译成渲染树：每层的文案都在这里由 `labelKey` / `titleKey` 换出来。
 *
 * `K` 由源树的 key 位与调用侧的 `t` 一起推出来，所以两端必须一致：源树声明成别的 key 集合
 * （或传一个宽到 `string` 的 `t`）在这里过不去——这四处以前正是靠 `t as (key: string) => string`
 * 才连上的（i18n.md §5.5 口子 2）。返回新数组，不改原菜单数据。
 */
export function translateSidebarItems<K extends string>(
    items: readonly SidebarSourceItem<K>[],
    t: (key: K) => string,
): SidebarItem[] {
    return items.map((item) => {
        if (!("sections" in item)) {
            // icon / dividerAfter 要带过去：卖家端顶层的「首页」「客服」就是带图标的叶子
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
