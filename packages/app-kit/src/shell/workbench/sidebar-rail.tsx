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

/** 窄轨列几何（宽度 / 内边距 / 行距 / 行高）：真实轨与骨架共用同一组常量——骨架比真值宽/窄一寸，首帧就跳一寸，抄两份类名是这类回归的源头 */
const RAIL_CLASS = "flex w-24 shrink-0 flex-col"
const RAIL_NAV_CLASS = "flex-1 overflow-y-auto px-2 py-3"
const RAIL_LIST_CLASS = "flex flex-col gap-1"
/** 行高 = py-2(8+8) + 图标 size-4(16) = 32px，圆角是 pill（rowCls 的 rounded-full） */
const RAIL_ROW_CLASS = "h-8 rounded-full"

/** 一级窄轨（受控、千牛式纵向列表）：全部由 pathname 驱动无状态，叶子→Link 直接导航、分组→Button 导航到该分组第一个叶子 */
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
                aria-label={t("nav.railLabel")}
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

/** 窄轨骨架：列宽/行高取真值常量，行数随意——真实条目在空列里长出或从尾部替换骨架，已有元素不动，不产生位移 */
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

const rowCls = (isShown: boolean) =>
    cn(
        "flex w-full items-center gap-2 rounded-full px-2.5 py-2 text-muted-foreground outline-hidden transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2",
        isShown &&
            "bg-accent font-medium text-accent-foreground shadow-sm hover:bg-accent hover:text-foreground",
    )

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
