import { Link } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
    Armchair,
    Baby,
    ChefHat,
    CircleAlert,
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

import {
    Button,
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuList,
    NavigationMenuTrigger,
    Skeleton,
    cn,
} from "@shop/ui-web"
import { QueryBoundary } from "@shop/app-kit/data"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { toApiError } from "@shop/common/contract"
import { useT } from "#/locales/use-t"

import type { NavEntryResponse, NavGroup } from "@shop/api/sdk"

import { navTitle } from "./nav"
import { searchParamsForNavEntry, searchParamsForNavItem } from "./nav-target"
import { homeNavOptions } from "./queries"

/**
 * 首页导航入口：主菜单分区词条（合并名），子层为 hover 展开的导航组。
 *
 * <p>数据来自 /api/cms/nav（NavEntryResponse），iconKey 为后端返回的字符串 key，前端映射到 lucide。
 * 三态与 ShopBar 同形（骨架 / 块级错误+重试 / 内容）：失败**不**折叠成「即将上线」空态——
 * 那句话只属于真正的空配置，读不到就该亮错误 + 官方 reset 重试。loader 已预热本查询，
 * 常规路径不挂起，pending 只是保险。
 */
export function HomeCategoryNav() {
    return (
        <QueryBoundary
            pending={<HomeCategoryNavSkeleton />}
            // oxlint-disable-next-line react/no-unstable-nested-components -- QueryBoundary fallback 需要每次渲染拿到 reset/error，不能提前抽成静态组件
            fallback={(args) => <HomeCategoryNavErrorFallback {...args} />}
        >
            <HomeCategoryNavContent />
        </QueryBoundary>
    )
}

/** 失败态：组件而非渲染函数，locale 与本端 catalog 要靠 hook 取（ShopBar / Feed 同款理由） */
function HomeCategoryNavErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <HomeCategoryNavError
            message={errorText(toApiError(error), locale, t("common.loadFailed.categoryNav"))}
            onRetry={reset}
        />
    )
}

/** 列壳：与同行的 banner/UserCard（h-50）等高对齐，三态同形避免布局跳动。
 *  宽 w-67（268px）：文字区 210px = 268 - px-2.5×2(20) - 图标 16 - gap 6 - chevron(16)
 *  底色/圆角/阴影由外层首屏白卡（routes/index.tsx 的 home-module 面板）提供，本列透明——
 *  列与列之间是发丝线而不是灰沟 */
const NAV_WIDTH_CLASS = "lg:w-67 lg:shrink-0"
const navColumnClass = `flex h-50 w-full items-center justify-center ${NAV_WIDTH_CLASS}`

export function HomeCategoryNavSkeleton() {
    return (
        <Skeleton
            className={`h-50 w-full ${NAV_WIDTH_CLASS}`}
            aria-hidden
        />
    )
}

function HomeCategoryNavError({
    message,
    onRetry,
}: {
    /** 已按 §7.3 那条链定稿的句子（`errorText`：登记码 → catalog，中文界面 → 后端 detail，否则站点那句） */
    message: string
    onRetry: () => void
}) {
    const t = useT("home")
    return (
        <div
            role="alert"
            className={navColumnClass}
        >
            <div className="flex flex-col items-center gap-3 px-4 text-center">
                <CircleAlert className="size-5 text-destructive" />
                <p className="text-sm text-muted-foreground">{message}</p>
                <Button
                    variant="outline"
                    size="sm"
                    shape="pill"
                    onClick={onRetry}
                >
                    {t("home.retry")}
                </Button>
            </div>
        </div>
    )
}

function HomeCategoryNavContent() {
    const { data: entries } = useSuspenseQuery(homeNavOptions)
    const t = useT("home")

    // 空数组是运营侧真正的空配置 → 明确的空态，不是「读不到」
    if (entries.length === 0) {
        return (
            <div className={navColumnClass}>
                <p className="px-4 text-center text-sm text-muted-foreground">
                    {t("home.categoryNav.comingSoon")}
                </p>
            </div>
        )
    }

    return (
        // 纵向 NavigationMenu（base-ui）：mega 面板锚在列右侧（side=right + align start），
        // hover 意图延时、点击开合（触屏由此可达）、方向键漫游、Escape/焦点移出收起、
        // aria-expanded 全部归组件库——旧的手写 activeId + mouseleave/blur 状态机整体退场。
        // h-50 与同行的 banner/UserCard（h-50）对齐；行高 h-8，收起态 6 行（192px）不切半行，
        // hover 列（或 mega 面板打开时，指针可能已不在列上）整列展开盖住下方内容露出剩余行
        <NavigationMenu
            aria-label={t("home.categoryNav.ariaLabel")}
            orientation="vertical"
            side="right"
            align="start"
            sideOffset={0}
            className={cn(
                "h-50 w-full max-w-none flex-none flex-col items-stretch justify-start",
                NAV_WIDTH_CLASS,
            )}
        >
            {/* 只 max-height 在动，但 Tailwind 没有对应 transition token，写
                `transition-[max-height]` 又撞 shadcn/no-arbitrary-values（error）——
                两条规则互斥，这里取 all：面板里没有别的属性在变。 */}
            {/* oxlint-disable-next-line react-doctor/no-transition-all */}
            <div className="no-scrollbar absolute inset-x-0 top-0 z-50 max-h-50 overflow-y-auto home-module transition-all duration-200 ease-out group-hover/navigation-menu:max-h-125 group-data-open/navigation-menu:max-h-125">
                <NavigationMenuList className="flex-col items-stretch justify-start">
                    {entries.map((entry) => (
                        <NavEntry
                            key={entry.id}
                            entry={entry}
                        />
                    ))}
                </NavigationMenuList>
            </div>
        </NavigationMenu>
    )
}

/** 词条行：有子组的走 NavigationMenuTrigger（hover/点击展开右侧面板）；无子组的只是普通按钮——给它挂个开了没内容的假面板更怪 */
function NavEntry({ entry }: { entry: NavEntryResponse }) {
    const Icon = (entry.iconKey ? ICON_BY_KEY[entry.iconKey] : undefined) ?? ShoppingBag
    const label = (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Icon className="size-4 shrink-0" />
            <span
                className="min-w-0 overflow-hidden text-clip whitespace-nowrap"
                title={entry.title}
            >
                {navTitle(entry.title)}
            </span>
        </span>
    )

    if (entry.subs.length === 0) {
        const search = searchParamsForNavEntry(entry)
        return (
            <li>
                {search ? (
                    <Link
                        to="/search"
                        search={search}
                        className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                        {label}
                    </Link>
                ) : (
                    <Button
                        variant="ghost"
                        className="w-full justify-start"
                    >
                        {label}
                    </Button>
                )}
            </li>
        )
    }

    return (
        <NavigationMenuItem
            value={entry.id}
            className="w-full"
        >
            {/* chevrons 由 Trigger 自带（data-open 时旋转）；ml-auto 把它顶到行尾，与行首分类图标对齐 */}
            <NavigationMenuTrigger className="h-8 w-full justify-start [&_svg:last-child]:ml-auto">
                {label}
            </NavigationMenuTrigger>
            <NavigationMenuContent className="w-2xl">
                {/* 词条组：横向流式平铺，一行的组名后跟整排词条 */}
                <div className="flex flex-col gap-4 p-4">
                    {entry.subs.map((group, i) => (
                        <NavGroupRow
                            key={`${group.name}-${i}`}
                            group={group}
                        />
                    ))}
                </div>
            </NavigationMenuContent>
        </NavigationMenuItem>
    )
}

function NavGroupRow({ group }: { group: NavGroup }) {
    const items = group.items?.filter((item) => item.trim()) ?? []
    return (
        <div className="flex items-baseline gap-3">
            <span className="flex shrink-0 items-center text-sm font-medium text-foreground">
                {group.name}
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {items.map((item) => (
                    <Link
                        key={item}
                        to="/search"
                        search={searchParamsForNavItem(item)}
                        className="whitespace-nowrap transition-colors hover:text-primary"
                    >
                        {item}
                    </Link>
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
