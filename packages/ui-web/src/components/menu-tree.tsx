import * as React from "react"

// ─────────────────────────────────────────────────────────────
// MenuTree —— 通用垂直导航菜单（HEADLESS：只负责行为逻辑，零视觉）
//
// 它不依赖任何 UI 组件（sidebar / collapsible / icon 全都不 import），
// 只承担「两级菜单的数据契约 + 折叠状态 + activeKey 联动展开」这些行为。
// 视觉完全由调用方通过 render props 注入：
//   - renderLeaf(leaf, isActive)
//   - renderGroup(group, { expanded, toggle, isActive(key) })
// 因此可同时服务于「站点深色侧边栏」(web) 与「工作台浅色二级面板」(seller)
// 等视觉迥异的场景——它们共享的是行为契约，不是外观。
//
// 自有状态：expandedKeys（哪些分组展开）。activeKey 变化时自动展开其所在分组
// （只"确保展开"，用户手动收起的不强制重开）。
// ─────────────────────────────────────────────────────────────

export interface MenuLeaf {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
    /** 叶子跳转目标 */
    to: string
}

export interface MenuGroup {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
    /** 分组是否可折叠（toggle 展示子项）。默认 false = 始终展开显示子项 */
    collapsible?: boolean
    /** 分组的子项只能是叶子，天然限制两级 */
    children: MenuLeaf[]
}

export type MenuItem = MenuLeaf | MenuGroup

export function isMenuGroup(item: MenuItem): item is MenuGroup {
    return "children" in item
}

export interface MenuTreeProps {
    items: MenuItem[]
    activeKey: string
    /** 叶子渲染：调用方决定视觉（Link/button/样式）。isActive = 当前高亮。 */
    renderLeaf: (leaf: MenuLeaf, isActive: boolean) => React.ReactNode
    /** 分组渲染：调用方决定视觉（折叠标题 + 子项列表）。expanded/toggle/isActive 由 MenuTree 提供。 */
    renderGroup: (
        group: MenuGroup,
        state: { expanded: boolean; toggle: () => void; isActive: (key: string) => boolean },
    ) => React.ReactNode
}

export function MenuTree({ items, activeKey, renderLeaf, renderGroup }: MenuTreeProps) {
    // 默认展开包含当前高亮项的分组（含 activeKey 变化时自动展开）
    const [expandedKeys, setExpandedKeys] = React.useState<ReadonlySet<string>>(
        () =>
            new Set(
                items
                    .filter(isMenuGroup)
                    .filter((group) => group.children.some((child) => child.key === activeKey))
                    .map((group) => group.key),
            ),
    )

    // activeKey 变化时自动展开新高亮项所在分组（只“确保展开”，用户手动收起的不强制重开）。
    // 用 effect 而非渲染期派生：因为要区分「activeKey 变化（自动展开）」与「用户手动收起（不重开）」，
    // 后者依赖用户的展开/收起交互历史（expandedKeys 状态），无法从 activeKey 纯派生。
    React.useEffect(() => {
        setExpandedKeys((prev) => {
            const parent = items.find(
                (item): item is MenuGroup =>
                    isMenuGroup(item) && item.children.some((child) => child.key === activeKey),
            )
            if (!parent || prev.has(parent.key)) return prev
            const next = new Set(prev)
            next.add(parent.key)
            return next
        })
    }, [activeKey, items])

    const toggle = (key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <>
            {items.map((item) =>
                isMenuGroup(item) ? (
                    <React.Fragment key={item.key}>
                        {renderGroup(item, {
                            expanded: expandedKeys.has(item.key),
                            toggle: () => toggle(item.key),
                            /** 是否为高亮项：调用方渲染子项（group.children）时用它判定，与 renderLeaf 的 isActive 同源 */
                            isActive: (key: string) => key === activeKey,
                        })}
                    </React.Fragment>
                ) : (
                    <React.Fragment key={item.key}>
                        {renderLeaf(item, item.key === activeKey)}
                    </React.Fragment>
                ),
            )}
        </>
    )
}
