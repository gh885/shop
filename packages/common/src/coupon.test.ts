import { describe, expect, it } from "vite-plus/test"

import {
    COUPON_STATUS_META,
    couponRuleText,
    couponSourceLabel,
    couponStatusMeta,
    couponStatusLabel,
    couponThresholdText,
    couponUnavailableReasonText,
    couponYuanText,
} from "./coupon"
import { money } from "./money"

/** 券文案测试：这一层是把契约数字翻译成人话，写错一个字用户就会按错的预期下单 */
describe("couponYuanText", () => {
    it("去掉无意义的尾随 0", () => {
        expect(couponYuanText(money(1000))).toBe("10")
        expect(couponYuanText(money(990))).toBe("9.9")
        expect(couponYuanText(money(1050))).toBe("10.5")
    })

    it("保留有意义的角分（10.05 不能被读成 10.5）", () => {
        expect(couponYuanText(money(1005))).toBe("10.05")
        expect(couponYuanText(money(5))).toBe("0.05")
    })
})

describe("couponThresholdText", () => {
    it("门槛 0 说「无门槛」，不说「满 ¥0 可用」", () => {
        expect(couponThresholdText(money(0))).toBe("无门槛")
    })

    it("有门槛给出金额", () => {
        expect(couponThresholdText(money(10000))).toBe("满 ¥100 可用")
    })
})

describe("couponRuleText", () => {
    it("一句话讲完门槛与面额", () => {
        expect(couponRuleText(money(10000), money(1000))).toBe("满 ¥100 减 ¥10")
        expect(couponRuleText(money(0), money(1000))).toBe("无门槛减 ¥10")
    })

    it("符号跟币种走，不写死 ¥", () => {
        expect(couponRuleText(money(10000, "USD"), money(1000, "USD"))).toBe("满 $100 减 $10")
    })
})

describe("couponUnavailableReasonText", () => {
    it("可用时没有原因（undefined 而不是空串）", () => {
        expect(couponUnavailableReasonText(null)).toBeUndefined()
        expect(couponUnavailableReasonText(undefined)).toBeUndefined()
    })

    it("每个原因码都有人话（与后端 message 同口径）", () => {
        expect(couponUnavailableReasonText("THRESHOLD_NOT_MET")).toBe("未达到优惠券的使用门槛")
        expect(couponUnavailableReasonText("EXPIRED")).toBe("优惠券已过期")
        expect(couponUnavailableReasonText("NOT_EFFECTIVE")).toBe("优惠券尚未生效")
        expect(couponUnavailableReasonText("CURRENCY_MISMATCH")).toBe("优惠券币种与本单不一致")
    })
})

describe("券状态与来源标签", () => {
    it("被未付款单占用说「结算中」，不是「已锁定」", () => {
        expect(couponStatusLabel("LOCKED")).toBe("结算中")
        expect(couponStatusLabel("UNUSED")).toBe("未使用")
        expect(couponStatusLabel("EXPIRED")).toBe("已过期")
    })

    it("退款补发的券要说明来路", () => {
        expect(couponSourceLabel("REFUND_RETURN")).toBe("退款补发")
        expect(couponSourceLabel("CLAIM")).toBe("领取")
    })

    it("未知码回退原码——宁可显示生僻词，也不让用户看到没有解释的券", () => {
        expect(couponStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW")
        expect(couponSourceLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW")
    })
})

describe("COUPON_STATUS_META（文字与徽章一张表）", () => {
    // 具体配色不钉成单测契约：换品牌色会红一片，却证明不了哪个状态该显眼。
    // 这里只守「三件事」：状态齐全、文案有值、未知状态有回退。
    it("五种展示状态都有文字与颜色：加状态漏一格就得到「新状态没颜色」", () => {
        // 键序也是券包分组要的那个次序（未使用 → 结算中 → 已使用 → 已过期 → 已作废）
        expect(Object.keys(COUPON_STATUS_META)).toEqual([
            "UNUSED",
            "LOCKED",
            "USED",
            "EXPIRED",
            "VOID",
        ])
        for (const meta of Object.values(COUPON_STATUS_META)) {
            expect(meta.label).toBeTruthy()
            expect(meta.variant).toBeTruthy()
        }
    })

    it("卡片徽章与券包页签读的是同一句中文：查文字不换表，就不存在第二份文案", () => {
        for (const [status, meta] of Object.entries(COUPON_STATUS_META)) {
            expect(couponStatusLabel(status)).toBe(meta.label)
        }
    })

    it("契约先出新状态、表还没跟上：文字回退码本身、颜色回退描边，不出空白徽章", () => {
        expect(couponStatusMeta("SOMETHING_NEW")).toEqual({
            label: "SOMETHING_NEW",
            variant: "outline",
        })
    })
})
