import { Link } from "@tanstack/react-router"
import { ChevronUp } from "lucide-react"
import {
    cn,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    MenuTree,
    Skeleton,
} from "@shop/ui-web"

import {
    matchesSidebarPath,
    sidebarLinkSearch,
    type SidebarGroup,
    type SubLeaf,
} from "./navigation"

/** 二级面板的列几何：面板与它的骨架共用，理由同窄轨（宽度是内容区的边界，抄两份就会漂）。 */
const PANEL_CLASS = "flex w-44 shrink-0 flex-col text-foreground"
const PANEL_BODY_CLASS = "flex-1 overflow-y-auto px-2.5 py-3"
/** 叶子行 h-8、分组标题 text-sm + py-1.5 也是 32px，两者同高 */
const PANEL_ROW_CLASS = "h-8 rounded-md"

/** 二级面板：headless MenuTree 驱动折叠 + activeKey 联动，视觉在此注入；受控无状态 */
export function SidebarPanel({
    shown,
    pathname,
    className,
}: {
    /** 叶子项无二级面板，不传则不渲染本组件内容 */
    shown?: SidebarGroup
    /** 当前 pathname（不含 /_app） */
    pathname: string
    className?: string
}) {
    if (!shown) return

    // child.key 用 leaf.to 保证跨分组唯一，activeKey 传 pathname 与 MenuTree「高亮叶子 key」契约对齐
    const groups = shown.sections.map((section) => ({
        key: section.title,
        label: section.title,
        collapsible: section.collapsible,
        children: section.items.map((leaf) => ({ ...leaf, key: leaf.to })),
    }))

    return (
        <aside className={cn(PANEL_CLASS, className)}>
            <div className={PANEL_BODY_CLASS}>
                <MenuTree
                    items={groups}
                    activeKey={
                        groups
                            .flatMap((group) => group.children)
                            .find((leaf) => matchesSidebarPath(leaf.to, pathname))?.key ?? pathname
                    }
                    renderLeaf={(leaf, isActive) => (
                        <LeafRow
                            key={leaf.key}
                            leaf={leaf}
                            isActive={isActive}
                        />
                    )}
                    renderGroup={(group, { expanded, toggle, isActive }) => (
                        <SectionBlock
                            key={group.key}
                            title={group.label}
                            collapsible={group.collapsible}
                            items={group.children}
                            expanded={expanded}
                            onToggle={toggle}
                            isActive={isActive}
                        />
                    )}
                />
            </div>
        </aside>
    )
}

/** 二级面板骨架，与真值同列宽同行高；这一列的存在首帧定稿、不能等菜单数据（否则插入时推走内容区，见 sidebar.tsx CLS）
    错落宽度挂外层 div：require-static-classes 读不进 cn(常量, 变量) 拼出的类名 */
export function SidebarPanelSkeleton({ className }: { className?: string }) {
    return (
        <aside
            className={cn(PANEL_CLASS, className)}
            aria-hidden
        >
            <div className={PANEL_BODY_CLASS}>
                <div className="mt-2 first:mt-0">
                    <div className="w-20">
                        <Skeleton className={PANEL_ROW_CLASS} />
                    </div>
                    <div className="flex flex-col gap-0.5 pl-1.5">
                        <Skeleton className={PANEL_ROW_CLASS} />
                        <div className="w-4/5">
                            <Skeleton className={PANEL_ROW_CLASS} />
                        </div>
                        <div className="w-3/5">
                            <Skeleton className={PANEL_ROW_CLASS} />
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    )
}

function SectionBlock({
    title,
    collapsible = false,
    items,
    expanded,
    onToggle,
    isActive,
}: {
    title: string
    collapsible?: boolean
    items: SubLeaf[]
    expanded: boolean
    onToggle: () => void
    isActive: (key: string) => boolean
}) {
    if (items.length === 0) {
        return <div className="px-2 py-1.5 text-sm font-semibold">{title}</div>
    }

    const rows = (
        <div className="flex flex-col gap-0.5 pl-1.5">
            {items.map((leaf) => (
                <LeafRow
                    key={leaf.key}
                    leaf={leaf}
                    isActive={isActive(leaf.key)}
                />
            ))}
        </div>
    )

    if (!collapsible) {
        return (
            <div className="mt-2 first:mt-0">
                <div className="px-2 py-1.5 text-sm font-semibold">{title}</div>
                {rows}
            </div>
        )
    }

    return (
        <Collapsible
            open={expanded}
            onOpenChange={onToggle}
            className="mt-2 first:mt-0"
        >
            <CollapsibleTrigger
                render={
                    <button
                        type="button"
                        className="group flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-semibold"
                    >
                        <span className="flex-1">{title}</span>
                        <ChevronUp className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180" />
                    </button>
                }
            />
            <CollapsibleContent>{rows}</CollapsibleContent>
        </Collapsible>
    )
}

function LeafRow({ leaf, isActive }: { leaf: SubLeaf; isActive: boolean }) {
    const cls = cn(
        "flex h-8 items-center rounded-md px-2.5 text-2xs text-foreground/75 outline-hidden transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2",
        isActive &&
            "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground",
    )
    return (
        <Link
            to={leaf.to}
            search={sidebarLinkSearch(leaf.search)}
            className={cls}
            aria-current={isActive ? "page" : undefined}
        >
            <span
                className="min-w-0 flex-1 truncate"
                title={leaf.label}
            >
                {leaf.label}
            </span>
        </Link>
    )
}
