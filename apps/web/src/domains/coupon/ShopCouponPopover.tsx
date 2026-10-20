import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TicketPercent } from "lucide-react"

import { formatDate, formatTimeShort } from "@shop/app-kit/display"
import { couponRuleText, useI18n } from "@shop/app-kit/i18n"
import { couponRule } from "@shop/common/domain"
import {
    Button,
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
    ScrollArea,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { openLoginDialog, useIsLoggedIn } from "#/shared/api/auth"

import { isCouponAlreadyClaimed, type ClaimableCoupon } from "./rules"
import { shopClaimableCouponsOptions, useClaimCoupon } from "./queries"

export function ShopCouponPopover({ shopId }: { shopId: string }) {
    const { locale } = useI18n()
    const t = useT()
    const { data, isPending, isError } = useQuery(shopClaimableCouponsOptions(shopId))
    const claim = useClaimCoupon()
    const isLoggedIn = useIsLoggedIn()
    const [claimedIds, setClaimedIds] = useState<string[]>([])
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
                        {t("coupon.popover.trigger")}
                    </Button>
                }
            />
            <PopoverContent
                align="end"
                className="w-80"
            >
                <PopoverHeader>
                    <PopoverTitle>{t("coupon.popover.title")}</PopoverTitle>
                </PopoverHeader>
                <ScrollArea className="max-h-72">
                    <ul className="flex flex-col gap-3">
                        {coupons.map((coupon) => {
                            const claimed = claimedIdSet.has(coupon.id)
                            const rule = couponRuleText(
                                couponRule(coupon.threshold, coupon, locale),
                                locale,
                            )
                            const notStarted = !coupon.soldOut && !coupon.claimable
                            const action = claimed
                                ? "claimed"
                                : coupon.soldOut
                                  ? "soldOut"
                                  : notStarted
                                    ? "notStarted"
                                    : "claim"
                            const label =
                                action === "claimed"
                                    ? t("coupon.claim.claimed")
                                    : action === "soldOut"
                                      ? t("coupon.claim.soldOut")
                                      : action === "notStarted"
                                        ? t("coupon.claim.openAt", {
                                              time: formatTimeShort(coupon.validFrom, locale),
                                          })
                                        : t("coupon.claim.claim")
                            return (
                                <li
                                    key={coupon.id}
                                    className="flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{rule}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {t("coupon.popover.range", {
                                                from: formatDate(coupon.validFrom, locale),
                                                to: formatDate(coupon.validTo, locale),
                                            })}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={action === "claim" ? "default" : "outline"}
                                        disabled={
                                            claimed ||
                                            coupon.soldOut ||
                                            notStarted ||
                                            claim.isPending
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
                </ScrollArea>
            </PopoverContent>
        </Popover>
    )
}
