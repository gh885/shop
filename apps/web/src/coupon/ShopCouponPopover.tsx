import { useState } from "react"
import { TicketPercent } from "lucide-react"

import type { ClaimableCouponResponse } from "@shop/api/sdk"

import { formatDate } from "@shop/app-kit"
import { couponRuleText } from "@shop/common"
import {
    Button,
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@shop/ui-web"

import { openLoginDialog, useIsLoggedIn } from "#/shared/api/auth"

import { isCouponAlreadyClaimed } from "./coupon"
import { useClaimCoupon, useShopClaimableCoupons } from "./queries"

/**
 * 商品详情页的领券入口（店铺条上的「领券」按钮 + 浮层）。
 *
 * 三件事在这里落定：
 * 1. **无券不给空浮层**：该店没有可领券（或还没拉到/拉失败）时整块不渲染 ——
 *    点开一个空浮层比看不到入口更让人困惑。
 * 2. **领券要登录**：可领券接口是 `/api/*` 匿名通道，但领券不是。未登录时拉起全局登录 Dialog，
 *    与 `PurchaseCta` 同一套做法（`openLoginDialog`），不另造一套。
 * 3. **已领完 / 已领取是文案不是灰**：按钮被禁用时按钮上就写着原因；
 *    `soldOut` 来自后端先到先得闸门，置灰只能表达「不能点」。
 */
export function ShopCouponPopover({ shopId }: { shopId: string }) {
    const { data, isPending, isError } = useShopClaimableCoupons(shopId)
    const claim = useClaimCoupon()
    const isLoggedIn = useIsLoggedIn()
    // 可领券响应刻意不带「我领过没」（匿名通道拿不到当前用户），已领标记只能是本浮层的局部状态
    const [claimedIds, setClaimedIds] = useState<string[]>([])

    const coupons = data ?? []
    if (isPending || isError || coupons.length === 0) return null

    function markClaimed(id: string) {
        setClaimedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }

    function handleClaim(coupon: ClaimableCouponResponse) {
        if (!isLoggedIn) {
            openLoginDialog()
            return
        }
        claim.mutate(coupon.id, {
            onSuccess: () => markClaimed(coupon.id),
            // 409「已领过」不是失败：就地标成已领取，用户不必再去券包确认券在不在
            onError: (err) => {
                if (isCouponAlreadyClaimed(err)) markClaimed(coupon.id)
            },
        })
    }

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        className="gap-1 rounded-full"
                    >
                        <TicketPercent />
                        领券
                    </Button>
                }
            />
            <PopoverContent
                align="end"
                className="w-80"
            >
                <PopoverHeader>
                    <PopoverTitle>店内优惠券</PopoverTitle>
                </PopoverHeader>
                {/* 券数无上界（模板是卖家随手建的），不给高度上限时超出的券连同「领取」按钮会被顶出视口且无滚动提示 */}
                <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                    {coupons.map((coupon) => {
                        const claimed = claimedIds.includes(coupon.id)
                        const rule = couponRuleText(coupon.threshold.amount, coupon.discount.amount)
                        const label = claimed ? "已领取" : coupon.soldOut ? "已领完" : "领取"
                        return (
                            <li
                                key={coupon.id}
                                className="flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{rule}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {formatDate(coupon.validFrom)} 至{" "}
                                        {formatDate(coupon.validTo)}
                                    </p>
                                </div>
                                {/* 可访问名带上规则，读屏用户才能分清哪张券：三个「领取」按钮同名等于没有名字 */}
                                <Button
                                    size="sm"
                                    variant={label === "领取" ? "default" : "outline"}
                                    disabled={claimed || coupon.soldOut || claim.isPending}
                                    aria-label={`${label} ${rule}`}
                                    onClick={() => handleClaim(coupon)}
                                >
                                    {label}
                                </Button>
                            </li>
                        )
                    })}
                </ul>
            </PopoverContent>
        </Popover>
    )
}
