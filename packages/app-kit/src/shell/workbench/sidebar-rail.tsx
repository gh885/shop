import { Link } from "@tanstack/react-router"
import { Button, cn, Skeleton } from "@shop/ui-web"

import { useT } from "../../i18n"

import {
    activeSectionOf,
    matchesSidebarPath,
    sidebarLinkSearch,
    type SidebarGroup,
    type SidebarItem,
    type SidebarLeaf,
} from "./navigation"

/** 窄轨的列几何（宽度 / 内边距 / 行距 / 行高）：真实轨与它的骨架共用同一组常量。
    骨架比真值宽一寸或窄一寸，首帧就会跳一寸 —— 抄两份类名是这类回归的源头。 */
const RAIL_CLASS = "flex w-24 shrink-0 flex-col"
const RAIL_NAV_CLASS = "flex-1 overflow-y-auto px-2 py-3"
const RAIL_LIST_CLASS = "flex flex-col gap-1"
/** 行高 = py-2(8+8) + 图标 size-4(16) = 32px，圆角是 pill（rowCls 的 rounded-full） */
const RAIL_ROW_CLASS = "h-8 rounded-full"

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
    const activeGroupKey = activeSectionOf(items, pathname)?.key
    const t = useT()

    return (
        <aside className={cn(RAIL_CLASS, className)}>
            <nav
                aria-label={t("appKit.nav.railLabel")}
                className={RAIL_NAV_CLASS}
            >
                <ul className={RAIL_LIST_CLASS}>
                    {items.map((item) => (
                        <li
                            key={item.key}
                            className="flex flex-col"
                        >
                            {"to" in item ? (
                                <LeafItem
                                    item={item}
                                    isShown={matchesSidebarPath(item.to, pathname)}
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

/** 窄轨骨架：列宽与行高按上面的常量取真值，行数随意——真实条目是在空列里长出来、
    或从尾部替换掉骨架行，已有元素一动不动，所以怎么数都不产生位移。 */
export function SidebarRailSkeleton({ className }: { className?: string }) {
    return (
        <aside
            className={cn(RAIL_CLASS, className)}
            aria-hidden
        >
            <nav className={RAIL_NAV_CLASS}>
                <ul className={RAIL_LIST_CLASS}>
                    {Array.from({ length: 5 }, (_, i) => (
                        <li
                            key={i}
                            className="flex flex-col"
                        >
                            <Skeleton className={RAIL_ROW_CLASS} />
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
            search={sidebarLinkSearch(item.search)}
            aria-current={isShown ? "page" : undefined}
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
                        search={sidebarLinkSearch(firstLeaf.search)}
                        aria-current={isShown ? "true" : undefined}
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
            <span
                className="min-w-0 flex-1 truncate text-xs leading-none"
                title={item.label}
            >
                {item.label}
            </span>
        </>
    )
}
