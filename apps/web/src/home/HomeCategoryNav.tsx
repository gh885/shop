import { useEffect, useRef } from "react"
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
import { warnIfAncestorCreatesStackingContext } from "./category-nav-stacking"

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

const NAV_WIDTH_CLASS = "lg:w-67 lg:shrink-0"
const navColumnClass = `home-rail flex h-50 w-full items-center justify-center ${NAV_WIDTH_CLASS}`

export function HomeCategoryNavSkeleton() {
    return (
        <Skeleton
            className={`h-50 w-full ${NAV_WIDTH_CLASS}`}
            aria-hidden
        />
    )
}

function HomeCategoryNavError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
    const panelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        warnIfAncestorCreatesStackingContext(panelRef.current)
    }, [])

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
            <div
                ref={panelRef}
                className="no-scrollbar absolute inset-x-0 top-0 z-raised max-h-50 overflow-y-auto home-rail transition-all duration-200 ease-out group-hover/navigation-menu:max-h-125 group-data-open/navigation-menu:max-h-125"
            >
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
            <NavigationMenuTrigger className="h-8 w-full justify-start [&_svg:last-child]:ml-auto">
                {label}
            </NavigationMenuTrigger>
            <NavigationMenuContent className="w-2xl">
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
