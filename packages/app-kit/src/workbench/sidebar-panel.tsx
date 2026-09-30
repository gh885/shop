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

/** 二级面板（受控，无状态，视觉自持）：置于白色浮面容器内，无 header，直接列分组。
    菜单结构由 headless MenuTree 驱动（折叠状态 + activeKey 联动展开），
    视觉在此注入：分组标题段落 + 小字叶子行，当前路径命中高亮。 */
export function SidebarPanel({
    shown,
    pathname,
    className,
}: {
    /** 当前一级分组项（叶子项无二级面板，不渲染本组件内容） */
    shown?: SidebarGroup
    /** 当前 pathname（不含 /_app） */
    pathname: string
    className?: string
}) {
    if (!shown) return

    // 把 shown 的 sections 适配成 MenuTree 的 MenuGroup 数据结构。
    // 叶子 to 即其唯一路径（pathname 第二段所在完整路径），整条面板的 activeKey 传 pathname
    // 与 MenuTree 契约（activeKey = 高亮叶子 key）对齐；child.key 用 leaf.to 保证跨分组唯一，
    // 使 MenuTree 的「activeKey 联动展开所在分型」能正确工作。
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

/** 二级面板骨架：一个标题段 + 几行叶子，与真值同列宽同行高。
    这一列的**存在**由装配在首帧就定稿（不能等菜单数据）：它一插进来就把内容区整体推走 176px。
    错落宽度挂在外层 div 上，`<Skeleton>` 自己只带几何常量——`require-static-classes` 读不进
    `cn(常量, 变量)` 拼出来的类名，而这条正是设计门禁要能看见的那一层。 */
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

/** 分组：标题段落；collapsible 用 Collapsible 折叠，否则直接列子项 */
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

/** 二级子项行：激活（当前路径命中）为 accent 弱底，其余弱化为次要文字；一律 Link 导航 */
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
