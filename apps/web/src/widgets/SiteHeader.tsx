import { Link } from "@tanstack/react-router"
import { LogOut, ShoppingCart, UserRound } from "lucide-react"

import {
    Avatar,
    AvatarFallback,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@shop/ui-web"

import { useCartCount } from "#/cart"
import { logout } from "#/features/login"
import { useClearMe, useMe } from "#/user"
import { useAuthStatus, useLoginDialogOpen } from "#/shared/api/auth"

import { SiteNav } from "./SiteNav"

/** 站点头部：京东式顶部灰条，不吸顶。仅保留导航 + 登录态，品牌 logo 由首页第一层承载 */
export function SiteHeader() {
    const status = useAuthStatus()
    const [, setLoginOpen] = useLoginDialogOpen()
    const cartCount = useCartCount()

    return (
        <header className="border-b border-border/60 bg-sunken/60">
            <div className="mx-auto flex h-9 max-w-(--container-page) items-center gap-6 px-6">
                <span className="text-xs text-muted-foreground">中国大陆站</span>

                <SiteNav />

                <div className="ml-auto flex items-center gap-3">
                    {/* 购物车入口：已登录显示角标计数，点击跳转到购物车页 */}
                    <Link
                        to="/cart"
                        aria-label="购物车"
                        className="relative flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ShoppingCart className="size-[18px]" />
                        {status === "authed" && (cartCount.data ?? 0) > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground">
                                {cartCount.data && cartCount.data > 99 ? "99+" : cartCount.data}
                            </span>
                        )}
                    </Link>

                    {status === "unknown" ? (
                        <span className="h-4 w-12 animate-pulse rounded bg-muted" />
                    ) : status === "authed" ? (
                        <UserMenu />
                    ) : (
                        <Button
                            size="sm"
                            className="px-3"
                            onClick={() => setLoginOpen(true)}
                        >
                            登录
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
}

/** 已登录用户区：头像 hover 展开菜单，含个人中心 + 退出登录 */
function UserMenu() {
    const me = useMe()
    const clearMe = useClearMe()

    const displayName = me.data?.nickname ?? me.data?.phone ?? "…"
    // avatarKey 是对象存储 key，URL 签发方案未落地，暂用首字符兜底
    const fallbackChar = displayName.charAt(0)

    async function handleLogout() {
        await logout()
        clearMe()
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
                openOnHover
                delay={80}
                closeDelay={120}
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Avatar>
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="min-w-40"
            >
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                </DropdownMenuGroup>
                <DropdownMenuItem render={<Link to="/account" />}>
                    <UserRound className="size-4" />
                    个人中心
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="size-4" />
                    退出登录
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
