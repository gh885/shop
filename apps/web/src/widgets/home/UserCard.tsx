import { Link, useNavigate } from "@tanstack/react-router"
import { Archive, Clock, Heart, MapPin, Star } from "lucide-react"

import { Avatar, AvatarFallback, Button } from "@shop/ui-web"

import { useLoginDialogOpen, useAuthStatus } from "#/shared/api/auth"
import { useMe } from "#/entities/user"
import { useCartCount } from "#/features/cart"

/**
 * 第二层最右侧：用户信息卡片（京东式，宽 ~250px）。
 *
 * 头像区按登录态切换：未登录 →「登录/注册」拉起登录弹窗；已登录 →「收货地址」跳账号中心。
 * 统计排接真实数据（购物车数走 useCartCount）；订单状态数暂以 0 占位，后端接入后补。
 * 底部导航接通账号子路由（我的订单 / 商品收藏等）。
 */
export function UserCard() {
    const [, setLoginOpen] = useLoginDialogOpen()
    const status = useAuthStatus()
    const { data: me } = useMe()
    const { data: cartCount } = useCartCount()
    const navigate = useNavigate()

    const loggedIn = status === "authed"
    const displayName = me?.nickname ?? me?.phone ?? "未登录"
    const fallbackChar = displayName.charAt(0)

    return (
        <div className="flex h-[200px] w-[250px] shrink-0 flex-col rounded-xl border border-border/60 bg-background p-4">
            {/* 头部：头像 + 昵称 */}
            <div className="flex items-center gap-3">
                <Avatar className="size-10">
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    {loggedIn ? (
                        <Link
                            to="/account/address"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                        >
                            <MapPin className="size-3" />
                            收货地址
                        </Link>
                    ) : (
                        <Button
                            variant="link"
                            onClick={() => setLoginOpen(true)}
                            className="mt-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                        >
                            登录 / 注册
                        </Button>
                    )}
                </div>
            </div>

            {/* 数字统计排：购物车 / 待收货 / 待发货 / 待付款 / 待评价 */}
            <div className="mt-3 grid grid-cols-5 text-center">
                {[
                    { label: "购物车", value: cartCount ?? 0 },
                    { label: "待收货", value: 0 },
                    { label: "待发货", value: 0 },
                    { label: "待付款", value: 0 },
                    { label: "待评价", value: 0 },
                ].map((item) => (
                    <div key={item.label}>
                        <div className="text-base font-semibold">{item.value}</div>
                        <div className="mt-0.5 text-[11px] truncate text-muted-foreground">
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* 底部导航：我的订单 / 浏览记录 / 商品收藏 / 店铺关注 —— 接通账号子路由 */}
            <div className="mt-auto grid grid-cols-4 text-center">
                {[
                    { label: "我的订单", icon: Archive, to: "/account/orders" },
                    { label: "浏览记录", icon: Clock, to: "/account/browsing" },
                    { label: "商品收藏", icon: Heart, to: "/account/favorites" },
                    { label: "店铺关注", icon: Star, to: "/account/following" },
                ].map((item) => (
                    <Button
                        key={item.label}
                        variant="ghost"

                        className="flex h-auto flex-col gap-1 text-xs p-1"
                        onClick={() =>
                            // TODO: 浏览记录 / 店铺关注页未实现，暂路由到首页；落地后接真实路径
                            void navigate({ to: item.to }).catch(() => {})
                        }
                    >
                        <item.icon className="size-4" />
                        {item.label}
                    </Button>
                ))}
            </div>
        </div>
    )
}
