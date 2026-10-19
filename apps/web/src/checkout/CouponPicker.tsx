import { couponMoneyText, couponReductionRule } from "@shop/common/domain"
import { formatDate } from "@shop/app-kit/display"
import { useT } from "#/locales/use-t"
import { couponRuleText, useI18n } from "@shop/app-kit/i18n"
import { ChevronDown, TicketPercent } from "lucide-react"

import {
    Button,
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
    RadioGroup,
    RadioGroupItem,
} from "@shop/ui-web"

import { couponUnavailableReasonKey } from "#/coupon"
import type { CheckoutGroup } from "./rules"

const NO_COUPON = "none"

export interface CouponPickerProps {
    group: Pick<CheckoutGroup, "coupons" | "discountAmount">
    selectedId: string | null
    onSelect: (userCouponId: string | null) => void
}

export function CouponPicker({ group, selectedId, onSelect }: CouponPickerProps) {
    const { locale } = useI18n()
    const t = useT()
    const usableCount = group.coupons.filter((c) => c.usable).length
    const label =
        selectedId === null
            ? usableCount > 0
                ? t("checkout.coupon.availableUnused", { count: usableCount })
                : t("checkout.coupon.noneAvailable")
            : t("checkout.coupon.reduced", {
                  money: couponMoneyText(group.discountAmount, locale),
              })

    if (group.coupons.length === 0) {
        return (
            <div className="border-t border-border/60 px-5 py-3 text-sm text-muted-foreground">
                {label}
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between gap-4 border-t border-border/60 px-5 py-2 text-sm">
            <span className="text-muted-foreground">{t("checkout.coupon.title")}</span>
            <Popover>
                <PopoverTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="sm"
                        >
                            <TicketPercent className="size-4" />
                            {label}
                            <ChevronDown className="size-4" />
                        </Button>
                    }
                />
                <PopoverContent
                    align="end"
                    className="w-80"
                >
                    <PopoverTitle>{t("checkout.coupon.selectTitle")}</PopoverTitle>
                    <RadioGroup
                        value={selectedId ?? NO_COUPON}
                        // oxlint-disable-next-line no-null -- CouponSelection 契约：null = 明确选「不使用优惠券」
                        onValueChange={(v: string) => onSelect(v === NO_COUPON ? null : v)}
                        className="max-h-72 overflow-y-auto"
                    >
                        {group.coupons.map((c) => {
                            const reasonKey = couponUnavailableReasonKey(c.unavailableReason)
                            const title = `${c.name} ${couponRuleText(couponReductionRule(c.threshold, c.discount, locale), locale)}`
                            return (
                                <Item
                                    key={c.userCouponId}
                                    variant={
                                        selectedId === c.userCouponId ? "selected" : "selectable"
                                    }
                                    size="sm"
                                >
                                    <RadioGroupItem
                                        value={c.userCouponId}
                                        disabled={!c.usable}
                                        aria-label={title}
                                    />
                                    <ItemContent>
                                        <ItemTitle>{title}</ItemTitle>
                                        <ItemDescription>
                                            {c.unavailableReason
                                                ? reasonKey
                                                    ? t(reasonKey)
                                                    : c.unavailableReason
                                                : t("checkout.coupon.validUntil", {
                                                      date: formatDate(c.expireAt, locale),
                                                  })}
                                        </ItemDescription>
                                    </ItemContent>
                                </Item>
                            )
                        })}
                        <Item
                            variant={selectedId === null ? "selected" : "selectable"}
                            size="sm"
                        >
                            <RadioGroupItem
                                value={NO_COUPON}
                                aria-label={t("checkout.coupon.noneOption")}
                            />
                            <ItemContent>
                                <ItemTitle>{t("checkout.coupon.noneOption")}</ItemTitle>
                            </ItemContent>
                        </Item>
                    </RadioGroup>
                </PopoverContent>
            </Popover>
        </div>
    )
}
