import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TicketPercent } from "lucide-react"

import { formatDate, formatTimeShort } from "@shop/app-kit"
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

import { isCouponAlreadyClaimed, type ClaimableCoupon } from "./coupon"
import { shopClaimableCouponsOptions, useClaimCoupon } from "./queries"

/**
 * 商品详情页的领券入口（店铺条上的「领券」按钮 + 浮层）。
 *
 * 四件事在这里落定：
 * 1. **无券不给空浮层**：该店没有可领券（或还没拉到/拉失败）时整块不渲染 ——
 *    点开一个空浮层比看不到入口更让人困惑。
 * 2. **领券要登录**：可领券接口是 `/api/*` 匿名通道，但领券不是。未登录时拉起全局登录 Dialog，
 *    与 `PurchaseCta` 同一套做法（`openLoginDialog`），不另造一套。
 * 3. **已领完 / 已领取是文案不是灰**：按钮被禁用时按钮上就写着原因；
 *    `soldOut` 来自后端先到先得闸门，置灰只能表达「不能点」。
 * 4. **未到点的预告券也露出（C9）**：后端用 `claimable=false`（契约必填）标未开抢，
 *    按钮写「MM-dd HH:mm 开抢」并禁用——看得到才有蹲点领取，
 *    消失等于用户以为没办活动。领取端点仍会拒未开始，双保险。
 */
export function ShopCouponPopover({ shopId }: { shopId: string }) {
    const { data, isPending, isError } = useQuery(shopClaimableCouponsOptions(shopId))
    const claim = useClaimCoupon()
    const isLoggedIn = useIsLoggedIn()
    // 可领券响应刻意不带「我领过没」（匿名通道拿不到当前用户），已领标记只能是本浮层的局部状态
    const [claimedIds, setClaimedIds] = useState<string[]>([])
    // 已领集合转 Set：券列表遍历里 includes 是 O(n×m)
    const claimedIdSet = useMemo(() => new Set(claimedIds), [claimedIds])

    const coupons = data ?? []
    if (isPending || isError || coupons.length === 0) return undefined

    function markClaimed(id: string) {
        setClaimedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }

    function handleClaim(coupon: ClaimableCoupon) {
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
                        shape="pill"
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
                        const claimed = claimedIdSet.has(coupon.id)
                        const rule = couponRuleText(coupon.threshold, coupon.discount)
                        // claimable=false 且没领完 = 未到发放起点（C9，契约必填布尔，不再回退本地比较 validFrom）
                        const notStarted = !coupon.soldOut && !coupon.claimable
                        const label = claimed
                            ? "已领取"
                            : coupon.soldOut
                              ? "已领完"
                              : notStarted
                                ? `${formatTimeShort(coupon.validFrom)} 开抢`
                                : "领取"
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
                                    disabled={
                                        claimed || coupon.soldOut || notStarted || claim.isPending
                                    }
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
