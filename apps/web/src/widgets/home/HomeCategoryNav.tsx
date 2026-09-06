import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
    Armchair,
    Baby,
    ChefHat,
    Dumbbell,
    Gamepad2,
    HandPlatter,
    Headphones,
    Laptop,
    Refrigerator,
    Shirt,
    ShoppingBag,
    Sparkles,
    Watch,
    type LucideIcon,
} from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"

import type { NavEntry, NavGroup } from "./model"

/**
 * 首页导航入口：主菜单分区词条（合并名），子层为 hover 展开的导航组。
 *
 * <p>数据来自 /api/cms/nav（NavEntry），iconKey 为后端返回的字符串 key，前端映射到 lucide。
 * 未完按时渲染骨架占位，避免布局跳动。
 */
export function HomeCategoryNav({
    defaultHeight = 320,
    entries,
}: {
    defaultHeight?: number
    entries?: NavEntry[]
}) {
    const [activeId, setActiveId] = useState<string | undefined>()

    // 未加载（undefined）→ 骨架占位；后端返回空数组 → 明确的空态，避免永远停在骨架
    if (entries === undefined) {
        return <Skeleton className="h-full w-full rounded-xl" />
    }

    if (entries.length === 0) {
        return (
            <div
                className="flex w-62.5 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm"
                style={{ height: defaultHeight }}
            >
                <p className="px-4 text-center text-sm text-muted-foreground">
                    商品分类即将上线，敬请期待
                </p>
            </div>
        )
    }

    const active = entries.find((e) => e.id === activeId) ?? undefined

    return (
        <div
            className="relative w-62.5 shrink-0"
            style={{ height: defaultHeight }}
            onMouseLeave={() => setActiveId(undefined)}
        >
            {/** 单列表：始终完整显示，hover 仅切换行高亮 + 右侧展开 Mega 面板，不做 absolute 跳动 */}
            <div className="h-full overflow-hidden rounded-lg bg-background shadow-sm">
                <ul>
                    {entries.map((entry) => {
                        const Icon =
                            (entry.iconKey ? ICON_BY_KEY[entry.iconKey] : undefined) ?? ShoppingBag
                        return (
                            <li key={entry.id}>
                                <Button
                                    variant="ghost"
                                    onMouseEnter={() => setActiveId(entry.id)}
                                    className={`w-full justify-start gap-3 rounded-none px-4 py-1.5 ${
                                        activeId === entry.id
                                            ? "bg-sunken text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="size-4 shrink-0" />
                                    <span className="truncate">{entry.title}</span>
                                </Button>
                            </li>
                        )
                    })}
                </ul>
            </div>

            {/* hover 展开的 Mega Menu 面板：绝对定位盖在右侧内容上方，高度由内容撑开 */}
            {active?.subs && active.subs.length > 0 && (
                <div className="absolute top-0 left-full z-50 hidden w-170 rounded-lg bg-background shadow-float md:block">
                    {/* 词条组：横向流式平铺，一行的组名后跟整排词条 */}
                    <div className="p-5">
                        <div className="flex flex-col gap-4">
                            {active.subs.map((group) => (
                                <NavGroupRow
                                    key={group.name}
                                    group={group}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function NavGroupRow({ group }: { group: NavGroup }) {
    return (
        <div className="flex items-baseline gap-3">
            {/* TODO: 分类词条需跳往对应分类/列表页，暂无路由，先落回首页 */}
            <Link
                to="/"
                className="group flex shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap"
            >
                {group.name}
                <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    &gt;
                </span>
            </Link>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {group.items.map((item) => (
                    <span
                        key={item}
                        className="cursor-pointer whitespace-nowrap transition-colors hover:text-primary"
                    >
                        {item}
                    </span>
                ))}
            </div>
        </div>
    )
}

/** 后端 iconKey → lucide 图标，未知 key 兜底 ShoppingBag；后端新增分区时在此补映射 */
const ICON_BY_KEY: Record<string, LucideIcon> = {
    appliance: Refrigerator,
    digital: Laptop,
    phone: Headphones,
    "appliance-kitchen": ChefHat,
    food: ShoppingBag,
    beauty: Sparkles,
    outdoor: Dumbbell,
    watch: Watch,
    "bag-toy": Shirt,
    furniture: Armchair,
    toy: Baby,
    gift: HandPlatter,
    game: Gamepad2,
}
