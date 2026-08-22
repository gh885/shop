import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

import {
    cn,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarProvider,
} from "@shop/ui-web"

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
 *
 * 实现：复用 sidebar 组件族的菜单件（SidebarMenuButton 自带激活态
 * data-active + hover/focus 环），分组展开用 Collapsible。SidebarProvider
 * 只是 context 载体（SidebarMenuButton 依赖 useSidebar），className="contents"
 * 消除其包裹 div 的布局影响。
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

export default function NavMenu({ items, activeKey, onSelect }: NavMenuProps) {
    // 默认展开包含当前高亮项的分组
    const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
        () =>
            new Set(
                items
                    .filter(isGroup)
                    .filter((group) => group.children.some((child) => child.key === activeKey))
                    .map((group) => group.key),
            ),
    )

    // activeKey 变化时自动展开新高亮项所在分组（只做"确保展开"，用户手动收起的不强制重开）
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
            <SidebarMenuItem key={leaf.key}>
                <SidebarMenuButton
                    isActive={active}
                    disabled={leaf.disabled}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelect(leaf.key)}
                    className={cn("h-9 px-3", indent && "pl-9")}
                >
                    {leaf.icon}
                    <span className="flex-1 truncate">{leaf.label}</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        )
    }

    return (
        <SidebarProvider className="contents">
            <nav
                aria-label="导航菜单"
                className="w-56 bg-sidebar text-sidebar-foreground"
            >
                <SidebarMenu className="gap-0.5 p-2">
                    {items.map((item) => {
                        if (!isGroup(item)) {
                            return renderLeaf(item, false)
                        }
                        const expanded = expandedKeys.has(item.key)
                        return (
                            <Collapsible
                                key={item.key}
                                open={expanded}
                                onOpenChange={() => toggleGroup(item.key)}
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger
                                        render={
                                            <SidebarMenuButton
                                                disabled={item.disabled}
                                                aria-controls={`nav-menu-${item.key}`}
                                                className="h-9 px-3"
                                            >
                                                {item.icon}
                                                <span className="flex-1 truncate">
                                                    {item.label}
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        "ms-auto transition-transform duration-200",
                                                        expanded && "rotate-180",
                                                    )}
                                                />
                                            </SidebarMenuButton>
                                        }
                                    />
                                    <CollapsibleContent id={`nav-menu-${item.key}`}>
                                        {/* 去掉 SidebarMenuSub 默认的左侧竖线缩进，沿用纯缩进风格 */}
                                        <SidebarMenuSub className="m-0 translate-x-0 gap-0.5 border-l-0 p-0 pt-0.5">
                                            {item.children.map((child) => renderLeaf(child, true))}
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>
                        )
                    })}
                </SidebarMenu>
            </nav>
        </SidebarProvider>
    )
}
