import * as React from "react"

/** HEADLESS 垂直导航菜单：不 import 任何 UI 组件，视觉全由调用方 render props 注入；自有状态只有 expandedKeys */
export interface MenuLeaf {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
    to: string
}

export interface MenuGroup {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
    /** 默认 false = 始终展开（非折叠） */
    collapsible?: boolean
    /** 子项只能是叶子，天然限制两级 */
    children: MenuLeaf[]
}

export type MenuItem = MenuLeaf | MenuGroup

export function isMenuGroup(item: MenuItem): item is MenuGroup {
    return "children" in item
}

export interface MenuTreeProps {
    items: MenuItem[]
    activeKey: string
    renderLeaf: (leaf: MenuLeaf, isActive: boolean) => React.ReactNode
    renderGroup: (
        group: MenuGroup,
        state: { expanded: boolean; toggle: () => void; isActive: (key: string) => boolean },
    ) => React.ReactNode
}

export function MenuTree({ items, activeKey, renderLeaf, renderGroup }: MenuTreeProps) {
    const [expandedKeys, setExpandedKeys] = React.useState<ReadonlySet<string>>(
        () =>
            new Set(
                items
                    .filter(isMenuGroup)
                    .filter((group) => group.children.some((child) => child.key === activeKey))
                    .map((group) => group.key),
            ),
    )

    // activeKey 变化时展开新高亮所在分组，但只「确保展开」：用户手动收起的不强制重开
    React.useEffect(() => {
        // oxlint-disable-next-line react/set-state-in-effect -- 见上方注释：需区分自动展开与用户手动收起，无法渲染期派生
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
                            /** 与 renderLeaf 的 isActive 同源 */
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
