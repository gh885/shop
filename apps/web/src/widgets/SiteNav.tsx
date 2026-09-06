import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
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

import { SELLER_URL } from "../shared/lib/external"

/** 二级导航项：hover 一级项展开下拉，悬停带 children 的项再右弹二级 */
interface SiteNavChildItem {
    label: string
    /** 目标路由；分类等页面未落地前先写占位路径，NavLink 里按字符串透传 */
    to: string
    children?: SiteNavChildItem[]
}

export interface SiteNavItem {
    label: string
    to?: string
    children?: SiteNavChildItem[]
}

const SITE_NAV_ITEMS: SiteNavItem[] = [
    { label: "首页", to: "/" },
    {
        label: "商品分类",
        // TODO: 分类浏览页尚未实现，to 均为占位路径，落地后接真实路由
        children: [
            {
                label: "服饰鞋包",
                to: "/categories/apparel",
                children: [
                    { label: "女装", to: "/categories/apparel/women" },
                    { label: "男装", to: "/categories/apparel/men" },
                    { label: "鞋靴", to: "/categories/apparel/shoes" },
                    { label: "箱包", to: "/categories/apparel/bags" },
                ],
            },
            {
                label: "数码家电",
                to: "/categories/digital",
                children: [
                    { label: "手机", to: "/categories/digital/phones" },
                    { label: "电脑办公", to: "/categories/digital/computers" },
                    { label: "家用电器", to: "/categories/digital/appliances" },
                ],
            },
            {
                label: "美妆个护",
                to: "/categories/beauty",
                children: [
                    { label: "护肤", to: "/categories/beauty/skincare" },
                    { label: "彩妆", to: "/categories/beauty/makeup" },
                    { label: "个人护理", to: "/categories/beauty/personal-care" },
                ],
            },
            {
                label: "家居家装",
                to: "/categories/home",
                children: [
                    { label: "家具", to: "/categories/home/furniture" },
                    { label: "家纺", to: "/categories/home/textiles" },
                    { label: "厨具", to: "/categories/home/kitchen" },
                ],
            },
            {
                label: "食品生鲜",
                to: "/categories/food",
                children: [
                    { label: "休闲零食", to: "/categories/food/snacks" },
                    { label: "生鲜果蔬", to: "/categories/food/fresh" },
                    { label: "酒水饮料", to: "/categories/food/drinks" },
                ],
            },
            {
                label: "母婴玩具",
                to: "/categories/baby",
                children: [
                    { label: "奶粉辅食", to: "/categories/baby/formula" },
                    { label: "纸尿裤", to: "/categories/baby/diapers" },
                    { label: "玩具", to: "/categories/baby/toys" },
                ],
            },
        ],
    },
    {
        label: "开店入驻",
        children: [
            { label: "我要开店", to: "/sell" },
            // 店铺/店员/商品管理已迁到卖家中心（apps/seller 独立 SPA）
            { label: "卖家中心", to: SELLER_URL },
        ],
    },
]

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
    if (to.startsWith("http")) {
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
    // 当前路径用于高亮激活项：直达项精确/前缀匹配，下拉组看任一子项是否命中
    const pathname = useRouterState({ select: (s) => s.location.pathname })
    const isChildActive = (item: SiteNavItem) =>
        item.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"))

    return (
        <nav className="flex items-center gap-1">
            {items.map((item) =>
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
                            data-active={isChildActive(item) || undefined}
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
