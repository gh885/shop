import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button, cn } from "@shop/ui-web"

/**
 * NavMenu —— 垂直导航菜单（账号中心侧边栏、后台菜单通用）
 *
 * 概念：把一组菜单项渲染成可导航列表，叶子项点击后通知外部，带 children 的
 * 分组项只负责展开/收起。它不知道路由、不知道业务，跳转到哪由外部决定。
 *
 * 契约：
 * - items     菜单结构（数据驱动，两层：分组 → 叶子）
 * - activeKey 当前高亮项，受控（外部通常由路由推导）
 * - onSelect  点击叶子项时回调 key；禁用项不触发
 *
 * 自有状态：expandedKeys（哪些分组展开了），纯 UI 状态，外部无需关心。
 */

export interface NavMenuLeaf {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
}

export interface NavMenuGroup {
    key: string
    label: string
    icon?: React.ReactNode
    disabled?: boolean
    /** 分组的子项只能是叶子，天然限制两层 */
    children: NavMenuLeaf[]
}

export type NavMenuItem = NavMenuLeaf | NavMenuGroup

export interface NavMenuProps {
    items: NavMenuItem[]
    activeKey: string
    onSelect: (key: string) => void
}

function isGroup(item: NavMenuItem): item is NavMenuGroup {
    return "children" in item
}

/** 菜单项尺寸：对齐原样式（h-9 高度、px-3 内边距、rounded-md），覆盖 Button 基类的 default 变体 */
const itemClass = "w-full px-3 gap-2 rounded-md font-normal"

export default function NavMenu({ items, activeKey, onSelect }: NavMenuProps) {
    // 默认展开包含当前高亮项的分组（如截图中"我的订单"因"我的卡券包"高亮而展开）
    const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
        () =>
            new Set(
                items
                    .filter(isGroup)
                    .filter((group) => group.children.some((child) => child.key === activeKey))
                    .map((group) => group.key),
            ),
    )

    // activeKey 变化时自动展开新高亮项所在分组（点击其他分组、外部路由跳转都适用）；
    // 只做"确保展开"，用户手动收起的分组不会被强制重开
    useEffect(() => {
        setExpandedKeys((prev) => {
            const parent = items.find(
                (item): item is NavMenuGroup =>
                    isGroup(item) && item.children.some((child) => child.key === activeKey),
            )
            if (!parent || prev.has(parent.key)) return prev
            const next = new Set(prev)
            next.add(parent.key)
            return next
        })
    }, [activeKey, items])

    const toggleGroup = (key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const renderLeaf = (leaf: NavMenuLeaf, indent: boolean) => {
        const active = leaf.key === activeKey
        return (
            <li key={leaf.key}>
                <Button
                    variant="ghost"
                    size="lg"
                    disabled={leaf.disabled}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelect(leaf.key)}
                    className={cn(
                        itemClass,
                        indent && "pl-9",
                        active &&
                            "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                >
                    {leaf.icon}
                    <span className="flex-1 truncate">{leaf.label}</span>
                </Button>
            </li>
        )
    }

    return (
        <nav
            aria-label="导航菜单"
            className="bg-sidebar text-sidebar-foreground w-56"
        >
            <ul className="flex flex-col gap-0.5 p-2">
                {items.map((item) => {
                    if (!isGroup(item)) {
                        return renderLeaf(item, false)
                    }
                    const expanded = expandedKeys.has(item.key)
                    return (
                        <li key={item.key}>
                            <Button
                                variant="ghost"
                                size="lg"
                                disabled={item.disabled}
                                aria-expanded={expanded}
                                aria-controls={`nav-menu-${item.key}`}
                                onClick={() => toggleGroup(item.key)}
                                className={itemClass}
                            >
                                {item.icon}
                                <span className="flex-1 truncate">{item.label}</span>
                                <ChevronDown
                                    className={cn(
                                        "ms-auto size-4 shrink-0 transition-transform duration-200",
                                        expanded && "rotate-180",
                                    )}
                                />
                            </Button>
                            {expanded && (
                                <ul
                                    id={`nav-menu-${item.key}`}
                                    className="mt-0.5 flex flex-col gap-0.5"
                                >
                                    {item.children.map((child) => renderLeaf(child, true))}
                                </ul>
                            )}
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
