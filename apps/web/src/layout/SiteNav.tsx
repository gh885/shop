import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useT } from "@shop/app-kit"
import { ChevronDown } from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@shop/ui-web"

import { isExternalTarget } from "#/shared/lib/external"

import { isNavGroupActive, SITE_NAV_ITEMS, type SiteNavItem, translateNavItems } from "./nav"

const navItemClass =
    "flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-popup-open:text-foreground data-active:text-foreground data-active:font-semibold"

/** Link 的 to 受 routeTree 类型约束；占位路由未注册，这里先放开为字符串。绝对 URL 走外链 <a> */
function NavLink({
    to,
    children,
    ...props
}: { to: string; children?: React.ReactNode } & Omit<
    React.ComponentProps<typeof Link>,
    "to" | "children"
>) {
    if (isExternalTarget(to)) {
        return (
            <a
                href={to}
                {...props}
            >
                {children}
            </a>
        )
    }
    return (
        <Link
            to={to}
            {...props}
        >
            {children}
        </Link>
    )
}

/** 顶部主导航：数据驱动，一级项 hover 展开下拉，下拉项带 children 时右弹二级 */
export function SiteNav({ items = SITE_NAV_ITEMS }: { items?: SiteNavItem[] }) {
    const t = useT()
    const translatedItems = React.useMemo(() => translateNavItems(items, t), [items, t])
    // 高亮激活项：菜单树、翻译表与激活判据都在 ./nav，这里只留渲染
    const pathname = useRouterState({ select: (s) => s.location.pathname })

    return (
        <nav className="flex items-center gap-1">
            {/* fallow-ignore-next-line complexity */}
            {translatedItems.map((item) =>
                item.children?.length ? (
                    <DropdownMenu
                        key={item.label}
                        modal={false}
                    >
                        <DropdownMenuTrigger
                            openOnHover
                            delay={80}
                            closeDelay={120}
                            className={navItemClass}
                            data-active={isNavGroupActive(pathname, item) || undefined}
                        >
                            {item.label}
                            <ChevronDown className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-40">
                            {item.children.map((child) =>
                                child.children?.length ? (
                                    <DropdownMenuSub key={child.label}>
                                        <DropdownMenuSubTrigger render={<NavLink to={child.to} />}>
                                            {child.label}
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            {child.children.map((leaf) => (
                                                <DropdownMenuItem
                                                    key={leaf.label}
                                                    render={<NavLink to={leaf.to} />}
                                                >
                                                    {leaf.label}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                ) : (
                                    <DropdownMenuItem
                                        key={child.label}
                                        render={<NavLink to={child.to} />}
                                    >
                                        {child.label}
                                    </DropdownMenuItem>
                                ),
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <NavLink
                        key={item.label}
                        to={item.to ?? "/"}
                        className={navItemClass}
                        activeProps={{ className: "text-foreground font-semibold" }}
                        activeOptions={{ exact: true }}
                    >
                        {item.label}
                    </NavLink>
                ),
            )}
        </nav>
    )
}
