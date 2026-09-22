import { Link } from "@tanstack/react-router"

import { formatDate, formatDateTime } from "@shop/app-kit"
import { couponMoneyText, couponRuleText, couponSourceLabel, couponStatusLabel } from "@shop/common"
import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import type { MyCoupon } from "./coupon"

/**
 * 券卡片 —— 券包里的一张券。
 *
 * **券面只有三行信息**：面额大字 / 一句话规则 / 店名 + 有效期。判据见
 * `docs/reference/coupon-platform-practices.md` §6.1：一张券要能被一句话解释完
 * （减多少 + 满多少 + 能在哪用）。多出来的每一行都在逼用户做交叉判定，
 * 所以券模板名、承担方之类的字段一律不在这里出现（需要时去券详情）。
 *
 * 状态与来源各给一个小标签：两者都是「这张券为什么和别的不一样」的解释，
 * 只靠颜色区分等于没解释（读屏用户与色觉障碍用户都拿不到）。
 *
 * 三行之外只有两类条件行（有则出、无则不占位）：订单回链与 C8 时间原因灰字。
 * 后者只在「还在手上却用不了」时出现（未开始 / 结算中但已过期）——
 * 徽章说的状态没解释「为什么点不动」，这一行补上；过期徽章已解释的（EXPIRED 页签里的行）不再重复。
 */
export function CouponCard({ coupon }: { coupon: MyCoupon }) {
    /** 未使用/结算中 = 还在手上；已使用/已过期/已作废 = 已经不承担转化 */
    const usable = coupon.status === "UNUSED" || coupon.status === "LOCKED"
    const rule = couponRuleText(coupon.threshold, coupon.discount)
    const scope = `${coupon.shopName} · ${formatDate(coupon.effectiveAt)} 至 ${formatDate(coupon.expireAt)}`
    const timeHint = timeReasonHint(coupon)

    return (
        <article className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            {/* ① 面额大字：券面额是整元语义，不走商品价的分段排版（角分在这里只是噪声） */}
            <p
                className={cn(
                    "w-24 shrink-0 border-r border-dashed border-border pr-4 text-center text-3xl font-bold leading-none tabular-nums",
                    usable ? "text-primary" : "text-muted-foreground",
                )}
            >
                {couponMoneyText(coupon.discount)}
            </p>

            <div className="min-w-0 flex-1 space-y-1">
                {/* ② 一句话规则 */}
                <p className="text-sm font-medium text-foreground">{rule}</p>
                {/* ③ 店名 + 有效期：一句话说不清适用范围就等于没说（店铺券 = 仅本店可用）。
                    这一行在窄屏（320–375px）必然被截断——面额列与两个徽章已经占掉大半宽度，
                    所以截断处必须留全值出口：与商品详情页店铺名同一套做法（Tooltip），
                    用可聚焦元素承载，键盘用户也能拿到完整文本。 */}
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                // 可见文本由 TooltipTrigger 的 children 提供；这里显式给可访问名，
                                // 一是让静态检查能关联到标签，二是保证读屏念到的是完整的那句话
                                aria-label={scope}
                                className="block w-full truncate text-left text-xs text-muted-foreground"
                            />
                        }
                    >
                        {scope}
                    </TooltipTrigger>
                    <TooltipContent>{scope}</TooltipContent>
                </Tooltip>
                {timeHint && <p className="text-xs text-muted-foreground">{timeHint}</p>}
                {coupon.orderId && (
                    <Link
                        to="/orders/$orderId"
                        params={{ orderId: coupon.orderId }}
                        className="inline-block text-xs text-link hover:underline"
                    >
                        查看订单
                    </Link>
                )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={STATUS_VARIANT[coupon.status] ?? "outline"}>
                    {couponStatusLabel(coupon.status)}
                </Badge>
                <Badge variant="ghost">{couponSourceLabel(coupon.source)}</Badge>
            </div>
        </article>
    )
}

/**
 * 展示状态 → 标签皮肤。文字（`couponStatusLabel`）始终存在，颜色只是让一屏多张券能一眼扫出区别；
 * 契约新增状态值时回退 outline，不会因为缺一个 variant 就渲染不出来。
 */
const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "outline"> = {
    UNUSED: "success",
    LOCKED: "warning",
    USED: "secondary",
    EXPIRED: "outline",
    VOID: "outline",
}

/**
 * 时间原因灰字（C8）：只对「还在手上却暂时/永远用不了」的行给出。
 * 未使用且已过期不会走到 EXPIRED 分支 —— 后端展示状态已把它折叠成 EXPIRED 徽章；
 * 到得了这里的过期是 LOCKED（被未付款订单占用、收敛任务不碰它），状态徽章不会解释这个。
 */
function timeReasonHint(coupon: MyCoupon): string | undefined {
    if (coupon.status !== "UNUSED" && coupon.status !== "LOCKED") return undefined
    switch (coupon.unavailableReason) {
        case "NOT_EFFECTIVE":
            return `尚未开始，${formatDateTime(coupon.effectiveAt)} 起可用`
        case "EXPIRED":
            return "使用时间已过，本单之外不能再使用"
        default:
            return undefined
    }
}
