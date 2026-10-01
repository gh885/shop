import { Link } from "@tanstack/react-router"

import { formatDate } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import {
    couponFaceRuleText,
    couponFaceText,
    couponSourceLabel,
    couponStatusMeta,
} from "@shop/common/domain"
import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { type MyCoupon, couponTimeReasonHint } from "./coupon"

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
    const { locale } = useI18n()
    /** 未使用/结算中 = 还在手上；已使用/已过期/已作废 = 已经不承担转化 */
    const usable = coupon.status === "UNUSED" || coupon.status === "LOCKED"
    const rule = couponFaceRuleText(coupon.threshold, coupon)
    const scope = `${coupon.shopName} · ${formatDate(coupon.effectiveAt, locale)} 至 ${formatDate(coupon.expireAt, locale)}`
    const timeHint = couponTimeReasonHint(coupon, locale)
    // 文字与徽章色取自 @shop/common 那一张 COUPON_STATUS_META（未知状态回退中性描边）
    const status = couponStatusMeta(coupon.status)

    return (
        <article className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            {/* ① 面额大字：券面额是整元语义，不走商品价的分段排版（角分在这里只是噪声） */}
            <p
                className={cn(
                    "w-24 shrink-0 border-r border-dashed border-border pr-4 text-center text-3xl font-bold leading-none tabular-nums",
                    usable ? "text-primary-subtle-foreground" : "text-muted-foreground",
                )}
            >
                {couponFaceText(coupon)}
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
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="ghost">{couponSourceLabel(coupon.source)}</Badge>
            </div>
        </article>
    )
}
