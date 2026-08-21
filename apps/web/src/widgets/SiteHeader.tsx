import { Link, useNavigate } from "@tanstack/react-router"
import { LogOut, UserRound } from "lucide-react"

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

import { logout } from "../features/session/actions"
import { useClearMe, useMe } from "../features/session/use-me"
import { useAuthStatus, useLoginDialogOpen } from "../shared/api/auth"

import { SiteNav } from "./SiteNav"

/** 站点头部：品牌 + 主导航 + 登录态区（头像 hover 弹出用户菜单） */
export function SiteHeader() {
    const status = useAuthStatus()
    const [, setLoginOpen] = useLoginDialogOpen()

    return (
        <header className="border-b border-border/60 bg-background/80">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
                <Link
                    to="/"
                    className="text-lg font-bold tracking-tight"
                >
                    Shop
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                        多店铺电商平台
                    </span>
                </Link>

                <SiteNav />

                <div className="ml-auto flex items-center gap-3">
                    {status === "unknown" ? (
                        <span className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
                    ) : status === "authed" ? (
                        <UserMenu />
                    ) : (
                        <Button onClick={() => setLoginOpen(true)}>登录</Button>
                    )}
                </div>
            </div>
        </header>
    )
}

/** 已登录用户区：头像 hover 展开菜单，含个人中心 + 退出登录 */
function UserMenu() {
    const navigate = useNavigate()
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
                <DropdownMenuItem onClick={() => navigate({ to: "/account" })}>
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
