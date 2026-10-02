import {
    couponMoneyText,
    couponReductionRule,
    couponUnavailableReasonText,
} from "@shop/common/domain"
import { formatDate } from "@shop/app-kit/display"
import { useT } from "#/locales/use-t"
import { useI18n } from "@shop/app-kit/i18n"
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

import { couponRuleText } from "#/coupon"
import type { CheckoutGroup } from "./checkout"

/**
 * 店铺组里的选券入口（一行）：触发按钮 + 候选 Popover。
 *
 * 三条口径都在这里落地（判据见 docs/reference/coupon-platform-practices.md §6.1）：
 * - **一张券一句话**：减多少 + 满多少，文案来自 @shop/common，页面不拼字符串；
 * - **可不可用由后端说了算**：`usable === false` 的券置灰，并把原因码翻成人话写在券上——
 *   只靠灰色表达"不能用"，用户只会以为是没点到；
 * - **候选顺序不在前端重排**：后端已按「可用优先 → 减得多 → 先过期」排好，前端照单渲染。
 */

/** 「不使用优惠券」选项的值：券 id 是 UUID，永远不会撞上这个哨兵 */
const NO_COUPON = "none"

export interface CouponPickerProps {
    /** 本控件只消费券候选与「已减多少」：不背整组行明细与运费 */
    group: Pick<CheckoutGroup, "coupons" | "discountAmount">
    /** 当前选中的券；null = 不使用优惠券 */
    selectedId: string | null
    /** 选中/取消选择：null 表示明确选择「不使用优惠券」 */
    onSelect: (userCouponId: string | null) => void
}

export function CouponPicker({ group, selectedId, onSelect }: CouponPickerProps) {
    const { locale } = useI18n()
    const t = useT()
    const usableCount = group.coupons.filter((c) => c.usable).length
    // 已减多少取自预览回显：这是后端算出来的券减免，不是前端拿券面额自己减的。
    // 没选券时不写「已减 ¥0」——那是一句读起来像"券失效了"的废话；此时该说的是"有几张能用、你还没用"。
    const label =
        selectedId === null
            ? usableCount > 0
                ? `${usableCount} 张可用，未使用`
                : "本店暂无可用优惠券"
            : `已减 ${couponMoneyText(group.discountAmount, locale)}`

    // 一张券候选都没有：没有可解释的东西，不开 Popover（开了也是空壳）
    if (group.coupons.length === 0) {
        return (
            <div className="border-t border-border/60 px-5 py-3 text-sm text-muted-foreground">
                {label}
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between gap-4 border-t border-border/60 px-5 py-2 text-sm">
            <span className="text-muted-foreground">优惠券</span>
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
                    <PopoverTitle>选择优惠券</PopoverTitle>
                    <RadioGroup
                        value={selectedId ?? NO_COUPON}
                        // oxlint-disable-next-line no-null -- CouponSelection 契约：null = 明确选「不使用优惠券」
                        onValueChange={(v: string) => onSelect(v === NO_COUPON ? null : v)}
                        className="max-h-72 overflow-y-auto"
                    >
                        {group.coupons.map((c) => {
                            const reason = couponUnavailableReasonText(c.unavailableReason)
                            const title = `${c.name} ${couponRuleText(couponReductionRule(c.threshold, c.discount, locale), locale, t)}`
                            return (
                                <Item
                                    key={c.userCouponId}
                                    variant={
                                        selectedId === c.userCouponId ? "selected" : "selectable"
                                    }
                                    size="sm"
                                >
                                    {/* 可访问名与可见标题同词；不可用信息在行内灰字里说明原因，不只靠置灰 */}
                                    <RadioGroupItem
                                        value={c.userCouponId}
                                        disabled={!c.usable}
                                        aria-label={title}
                                    />
                                    <ItemContent>
                                        <ItemTitle>{title}</ItemTitle>
                                        <ItemDescription>
                                            {reason ?? `${formatDate(c.expireAt, locale)} 前有效`}
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
                                aria-label="不使用优惠券"
                            />
                            <ItemContent>
                                <ItemTitle>不使用优惠券</ItemTitle>
                            </ItemContent>
                        </Item>
                    </RadioGroup>
                </PopoverContent>
            </Popover>
        </div>
    )
}
