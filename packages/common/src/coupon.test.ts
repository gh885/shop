import { describe, expect, it } from "vitest"

import {
    couponRuleText,
    couponSourceLabel,
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
