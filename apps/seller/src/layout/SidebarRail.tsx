import { Link } from "@tanstack/react-router"
import { Button, cn } from "@shop/ui-web"

import type { SidebarGroup, SidebarItem, SidebarLeaf } from "./SidebarMenu"

/** 一级窄轨（受控，千牛式纵向列表）：蓝灰 canvas 底，图标左 + 名称右，选中 = 白色 pill。
    全部由当前 pathname 驱动（无状态）：
    - 一级分组高亮 = pathname 第一段匹配分组 key
    - 叶子项（home）→ Link 直接导航
    - 分组项 → Button，点击导航到该分组第一个叶子的路径（替换 pathname 第一段） */
export function SidebarRail({
    items,
    pathname,
    className,
}: {
    items: SidebarItem[]
    /** 当前 pathname（不含 /_app），用于推导一级高亮 */
    pathname: string
    className?: string
}) {
    // 当前一级分组 key（pathname 第一段）
    const activeGroupKey = pathname.split("/")[1]

    return (
        <aside className={cn("flex w-24 shrink-0 flex-col", className)}>
            <nav
                aria-label="一级导航"
                className="flex-1 overflow-y-auto px-2 py-3"
            >
                <ul className="flex flex-col gap-1">
                    {items.map((item) => (
                        <li
                            key={item.key}
                            className="flex flex-col"
                        >
                            {"to" in item ? (
                                <LeafItem
                                    item={item}
                                    isShown={item.key === "home" && pathname === "/"}
                                />
                            ) : (
                                <GroupItem
                                    item={item}
                                    isShown={item.key === activeGroupKey}
                                />
                            )}
                            {item.dividerAfter && <hr className="mx-3 my-2 border-foreground/8" />}
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    )
}

/** 共用行样式：图标 + 名称（横向铺满），选中 = accent 弱底 pill */
const rowCls = (isShown: boolean) =>
    cn(
        "flex w-full items-center gap-2 rounded-full px-2.5 py-2 text-muted-foreground outline-hidden transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2",
        isShown &&
            "bg-accent font-medium text-accent-foreground shadow-sm hover:bg-accent hover:text-foreground",
    )

/** 叶子项：可跳转路由 → Link，点击即导航 */
function LeafItem({ item, isShown }: { item: SidebarLeaf; isShown: boolean }) {
    return (
        <Link
            to={item.to}
            className={rowCls(isShown)}
        >
            <IconAndLabel item={item} />
        </Link>
    )
}

/** 分组项：无独立路由，点击导航到该分组第一个叶子的路径 */
function GroupItem({ item, isShown }: { item: SidebarGroup; isShown: boolean }) {
    const firstLeaf = item.sections[0]?.items[0]
    const target = firstLeaf?.to

    return (
        <Button
            variant="ghost"
            nativeButton={false}
            render={
                target ? (
                    <Link
                        to={target}
                        className={rowCls(isShown)}
                    />
                ) : undefined
            }
        >
            <IconAndLabel item={item} />
        </Button>
    )
}

/** 图标 + 名称 */
function IconAndLabel({ item }: { item: SidebarItem }) {
    return (
        <>
            <span className="[&>svg]:size-4 [&>svg]:shrink-0">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate text-xs leading-none">{item.label}</span>
        </>
    )
}
