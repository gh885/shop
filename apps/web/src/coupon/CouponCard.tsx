import { Link } from "@tanstack/react-router"

import { formatDate } from "@shop/app-kit/display"
import { couponRuleText, useI18n } from "@shop/app-kit/i18n"
import { couponFaceValue, couponRule } from "@shop/common/domain"
import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { type MyCoupon, couponSourceKey, couponStatusMeta, couponTimeReasonHint } from "./coupon"
import { couponFaceText } from "./coupon-rule"

export function CouponCard({ coupon }: { coupon: MyCoupon }) {
    const { locale } = useI18n()
    const t = useT()
    const usable = coupon.status === "UNUSED" || coupon.status === "LOCKED"
    const rule = couponRuleText(couponRule(coupon.threshold, coupon, locale), locale)
    const scope = t("coupon.card.scope", {
        shop: coupon.shopName,
        from: formatDate(coupon.effectiveAt, locale),
        to: formatDate(coupon.expireAt, locale),
    })
    const timeHint = couponTimeReasonHint(coupon, locale)
    const sourceKey = couponSourceKey(coupon.source)
    const status = couponStatusMeta(coupon.status)

    return (
        <article className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <p
                className={cn(
                    "w-24 shrink-0 border-r border-dashed border-border pr-4 text-center text-3xl font-bold leading-none tabular-nums",
                    usable ? "text-primary-subtle-foreground" : "text-muted-foreground",
                )}
            >
                {couponFaceText(couponFaceValue(coupon, locale), locale, t)}
            </p>

            <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">{rule}</p>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                aria-label={scope}
                                className="block w-full truncate text-left text-xs text-muted-foreground"
                            />
                        }
                    >
                        {scope}
                    </TooltipTrigger>
                    <TooltipContent>{scope}</TooltipContent>
                </Tooltip>
                {timeHint && (
                    <p className="text-xs text-muted-foreground">
                        {timeHint.key === "coupon.reason.notEffective"
                            ? t(timeHint.key, { datetime: timeHint.datetime })
                            : t(timeHint.key)}
                    </p>
                )}
                {coupon.orderId && (
                    <Link
                        to="/orders/$orderId"
                        params={{ orderId: coupon.orderId }}
                        className="inline-block text-xs text-link hover:underline"
                    >
                        {t("coupon.card.viewOrder")}
                    </Link>
                )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={status.variant}>
                    {status.labelKey ? t(status.labelKey) : coupon.status}
                </Badge>
                <Badge variant="ghost">{sourceKey ? t(sourceKey) : coupon.source}</Badge>
            </div>
        </article>
    )
}
