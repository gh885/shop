import type { ReactNode } from "react"
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router"
import { requireAuth } from "#/shared/lib/api"
import { Input, Separator, TopBar, TopBarActions, TopBarBrand } from "@shop/ui-web"
import {
    BellIcon,
    BookOpenIcon,
    ChevronDownIcon,
    CircleHelpIcon,
    HeadsetIcon,
    SearchIcon,
    StoreIcon,
} from "lucide-react"

import { AccountAvatar } from "#/components/account"
import { PageBreadcrumb, type Crumb } from "#/components/page-breadcrumb"
import { SellerSidebarProvider, SidebarPanel, SidebarRail } from "#/components/seller-sidebar"
import { ShopSwitcher } from "#/components/shop-switcher"
import { useMe } from "#/shared/lib/me"
import { useCurrentShop } from "#/shared/lib/shop"

export const Route = createFileRoute("/_app")({
    beforeLoad: requireAuth,
    component: SellerLayout,
})

// 占位导航的高亮 key 映射：当前路由 → 二级菜单项 key（后续接真实菜单树时替换）
const ACTIVE_KEY_BY_PATH: Record<string, string> = {
    "/products": "products",
    "/products/new": "products-new",
    "/shops": "shops",
    "/members": "members",
}

/** 当前路由推导出的侧边栏高亮 key */
function activeKeyOf(pathname: string): string {
    return ACTIVE_KEY_BY_PATH[pathname] ?? ""
}

// 页面面包屑：路径 → [一级栏目, 当前页]（首页 / 栏目 / 当前页）
const CRUMB_SECTION_BY_PATH: Record<string, { section: string; page: string }> = {
    "/products": { section: "商品", page: "商品列表" },
    "/products/new": { section: "商品", page: "发布商品" },
    "/shops": { section: "店铺", page: "店铺管理" },
    "/members": { section: "店铺", page: "店员管理" },
}

/** 当前路由推导出的面包屑 */
function crumbsOf(pathname: string): Crumb[] {
    const hit = CRUMB_SECTION_BY_PATH[pathname]
    if (!hit) return [{ label: "首页", to: "/" }]
    return [{ label: "首页", to: "/" }, { label: hit.section }, { label: hit.page }]
}

/** 工作台壳（千牛式）：蓝灰 canvas 画布上，通栏透明顶栏 + 一级轨，
    「二级面板 + 内容」合并为一张白色浮面（大圆角、无分割线） */
export function SellerLayout() {
    const { pathname } = useLocation()

    return (
        <SellerSidebarProvider activeKey={activeKeyOf(pathname)}>
            <div className="flex h-svh w-full flex-col">
                <AppTopBar />
                <div className="flex min-h-0 flex-1">
                    <SidebarRail />
                    {/* 白色浮面：面板与内容同处一张卡，rounded-tl 浮于 canvas */}
                    <div className="flex min-w-0 flex-1 rounded-tl-2xl bg-background">
                        <SidebarPanel />
                        <main className="min-w-0 flex-1 overflow-auto p-6">
                            <PageBreadcrumb
                                crumbs={crumbsOf(pathname)}
                                className="mb-4"
                            />
                            <Outlet />
                        </main>
                    </div>
                </div>
            </div>
        </SellerSidebarProvider>
    )
}

/** 顶栏动作项：图标在上、小字在下（千牛式），消息带红点；hover 白 pill 浮现 */
function TopBarAction({
    icon,
    label,
    dot = false,
}: {
    icon: ReactNode
    label: string
    dot?: boolean
}) {
    return (
        <button
            type="button"
            title={label}
            className="flex w-11 flex-col items-center gap-1 rounded-lg py-1.5 outline-hidden transition-all duration-150 hover:bg-background hover:shadow-sm focus-visible:ring-2"
        >
            <span className="relative text-foreground/80 [&>svg]:size-4.5">
                {icon}
                {dot && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" />
                )}
            </span>
            <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
        </button>
    )
}

/** 顶栏：透明浮于 canvas 画布，无分割线；品牌块 + 店铺切换 + 白色 pill 搜索；右侧公告、动作群、账号 */
function AppTopBar() {
    return (
        <TopBar className="gap-3 border-b-0 bg-transparent px-4">
            <TopBarBrand className="mr-0 gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <StoreIcon className="size-4.5" />
                </span>
                <span className="text-sm font-semibold tracking-tight">卖家中心</span>
            </TopBarBrand>

            <ShopSwitcher />

            <div className="relative hidden w-60 md:block">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="搜索菜单、功能"
                    className="h-9 rounded-full border-transparent bg-background pl-9 shadow-none focus-visible:border-transparent focus-visible:ring-2"
                />
            </div>

            <div className="min-w-0 flex-1" />

            <span className="hidden items-center gap-2 truncate text-xs lg:flex">
                <span className="font-medium text-primary">公告</span>
                <Separator
                    orientation="vertical"
                    className="h-3"
                />
                <span className="truncate text-muted-foreground">平台年货节招商报名已开启</span>
            </span>

            <TopBarActions className="gap-1">
                <TopBarAction
                    icon={<BellIcon />}
                    label="消息"
                    dot
                />
                <TopBarAction
                    icon={<BookOpenIcon />}
                    label="规则"
                />
                <TopBarAction
                    icon={<CircleHelpIcon />}
                    label="帮助"
                />
                <TopBarAction
                    icon={<HeadsetIcon />}
                    label="客服"
                />
                <Separator
                    orientation="vertical"
                    className="mx-1.5 h-6"
                />
                <AccountChip />
            </TopBarActions>
        </TopBar>
    )
}

/** 右上角账号：头像 + 当前店铺名 + 用户名 + 下拉 chevron（千牛式账号入口） */
function AccountChip() {
    const { data: me } = useMe()
    const shop = useCurrentShop()
    const name = me?.nickname ?? me?.phone ?? "未登录"
    const shopName = shop?.name ?? "未选择店铺"

    return (
        <button
            type="button"
            title={`${shopName} · ${name}`}
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 outline-hidden transition-all duration-150 hover:bg-background hover:shadow-sm focus-visible:ring-2"
        >
            <AccountAvatar />
            <div className="grid text-left leading-tight">
                <span className="max-w-36 truncate text-sm font-medium">{shopName}</span>
                <span className="max-w-36 truncate text-xs text-muted-foreground">{name}</span>
            </div>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
    )
}
