import { Link } from "@tanstack/react-router"
import { LogOut, ShoppingCart, UserRound } from "lucide-react"

import {
    Avatar,
    AvatarFallback,
    buttonVariants,
    Button,
    cn,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Skeleton,
} from "@shop/ui-web"

import { useCartCount } from "#/cart"
import { logout } from "#/auth"
import { useT } from "#/locales/use-t"
import { useClearMe, useMe } from "#/account"
import { useAuthStatus, useLoginDialogOpen } from "#/shared/api/auth"
import { avatarInitial } from "#/shared/lib/avatar"

import { SiteNav } from "./SiteNav"

/** 站点头部：京东式顶部灰条，不吸顶。仅保留导航 + 登录态，品牌 logo 由首页第一层承载 */
// fallow-ignore-next-line complexity
export function SiteHeader() {
    const t = useT()
    const status = useAuthStatus()
    const [, setLoginOpen] = useLoginDialogOpen()
    const cartCount = useCartCount()

    return (
        <header className="border-b border-border/60 bg-sunken/60">
            {/* 窄屏换行而不是压缩：单行不折行时，登录/购物车会被顶出右边界（320px 下不可点、也不可横向滚到）。
                md 起仍锁回 36px 单行，视觉与原来一致 */}
            <div className="mx-auto flex min-h-9 max-w-page flex-wrap items-center gap-x-6 gap-y-1 px-6 py-1 md:h-9 md:py-0">
                <span className="text-xs text-muted-foreground">{t("web.header.region")}</span>

                <SiteNav />

                <div className="ml-auto flex items-center gap-3">
                    {/* 购物车入口：已登录显示角标计数，点击跳转到购物车页 */}
                    <Link
                        to="/cart"
                        aria-label={t("web.header.cart")}
                        className={cn(
                            buttonVariants({
                                variant: "ghost",
                                size: "icon-sm",
                                shape: "pill",
                            }),
                            "relative text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <ShoppingCart className="size-4.5" />
                        {status === "authed" && (cartCount.data ?? 0) > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-active px-1 text-3xs leading-none text-primary-foreground">
                                {cartCount.data && cartCount.data > 99 ? "99+" : cartCount.data}
                            </span>
                        )}
                    </Link>

                    {status === "unknown" ? (
                        <Skeleton className="h-4 w-12" />
                    ) : status === "authed" ? (
                        <UserMenu />
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => setLoginOpen(true)}
                        >
                            {t("web.header.login")}
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
}

/** 已登录用户区：头像 hover 展开菜单，含个人中心 + 退出登录 */
// fallow-ignore-next-line complexity
function UserMenu() {
    const t = useT()
    const me = useMe()
    const clearMe = useClearMe()

    const displayName = me.data?.nickname ?? me.data?.phone ?? "…"
    // avatarKey 是对象存储 key，URL 签发方案未落地，暂用首字符兜底
    const fallbackChar = avatarInitial(displayName)

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
                    {t("web.header.account")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="size-4" />
                    {t("web.header.logout")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
