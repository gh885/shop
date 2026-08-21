import { Avatar, AvatarFallback, Button } from "@shop/ui-web"
import { Archive, Clock, Heart, Star } from "lucide-react"

import { useLoginDialogOpen } from "#/shared/api/auth"
import { useMe } from "#/features/session/use-me"

/** 第二层最右侧：用户信息卡片（京东式，宽 ~250px） */
export function UserCard() {
    const [, setLoginOpen] = useLoginDialogOpen()
    const { data: me } = useMe()

    const displayName = me?.nickname ?? me?.phone ?? "未登录"
    const fallbackChar = displayName.charAt(0)

    return (
        <div className="flex h-[200px] flex-col rounded-xl border border-border/60 bg-background p-4">
            {/* 头部：头像 + 昵称 */}
            <div className="flex items-center gap-3">
                <Avatar className="size-10">
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <button
                        type="button"
                        onClick={() => setLoginOpen(true)}
                        className="mt-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                        登录 / 注册
                    </button>
                </div>
            </div>

            {/* 数字统计排：购物车 / 待收货 / 待发货 / 待付款 / 待评价 */}
            <div className="mt-3 grid grid-cols-5 text-center">
                {[
                    { label: "购物车", value: 2 },
                    { label: "待收货", value: 0 },
                    { label: "待发货", value: 0 },
                    { label: "待付款", value: 0 },
                    { label: "待评价", value: 0 },
                ].map((item) => (
                    <div key={item.label}>
                        <div className="text-sm font-semibold">{item.value}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</div>
                    </div>
                ))}
            </div>

            {/* 底部导航：我的订单 / 浏览记录 / 商品收藏 / 店铺关注 */}
            <div className="mt-auto grid grid-cols-4 text-center">
                {[
                    { label: "我的订单", icon: Archive },
                    { label: "浏览记录", icon: Clock },
                    { label: "商品收藏", icon: Heart },
                    { label: "店铺关注", icon: Star },
                ].map((item) => (
                    <Button
                        key={item.label}
                        variant="ghost"
                        className="flex h-auto flex-col gap-1 px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        <item.icon className="size-4" />
                        {item.label}
                    </Button>
                ))}
            </div>
        </div>
    )
}
