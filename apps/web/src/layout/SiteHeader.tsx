import { LocaleSwitcher } from "@shop/app-kit/i18n"
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

import { useCartCount } from "#/domains/cart"
import { logout } from "#/domains/auth"
import { useT } from "#/locales/use-t"
import { useClearMe, useMe } from "#/domains/account"
import { useAuthStatus, useLoginDialogOpen } from "#/shared/api/auth"
import { avatarInitial } from "#/shared/lib/avatar"

import { SiteNav } from "./SiteNav"

export function SiteHeader() {
    const t = useT("header")
    const status = useAuthStatus()
    const [, setLoginOpen] = useLoginDialogOpen()
    const cartCount = useCartCount()

    return (
        <header className="border-b border-border/60 bg-background">
            <div className="mx-auto flex min-h-9 w-full max-w-page flex-wrap items-center gap-x-6 gap-y-1 px-6 py-1 md:h-9 md:py-0">
                <span className="text-xs text-muted-foreground">{t("header.region")}</span>

                <SiteNav />

                <div className="ml-auto flex items-center gap-3">
                    <LocaleSwitcher />
                    <Link
                        to="/cart"
                        aria-label={t("header.cart")}
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
                            {t("header.login")}
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
}

function UserMenu() {
    const t = useT("header")
    const me = useMe()
    const clearMe = useClearMe()

    const displayName = me.data?.nickname ?? me.data?.phone ?? "…"
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
                    {t("header.account")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="size-4" />
                    {t("header.logout")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
