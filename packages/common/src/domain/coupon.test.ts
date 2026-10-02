import { describe, expect, it } from "vite-plus/test"

import {
    COUPON_STATUS_META,
    couponFaceValue,
    couponRate,
    couponReductionRule,
    couponRule,
    couponSourceLabel,
    couponStatusMeta,
    couponStatusLabel,
    couponUnavailableReasonText,
} from "./coupon"
import { money } from "./money"

/**
 * 券的**事实层**测试：这一层把契约数字与码值变成「带什么信息、缺什么信息」的形状，
 * 不产出句子——句子在各端 catalog（§4.1：common 不承载用户可见文案）。
 *
 * 这一层钉的是「该给的数给对了、该缺的标成 undefined」：
 * 门槛 0 必须是 `threshold: undefined`（不是「满 ¥0」），折扣必须同时给十分位与百分比
 * （中文「九折」与英文 `10% off` 是两个数），封顶缺失必须是 `cap: undefined`
 * （CPN-65：封顶不写进句子 = 用户以为无限九折）。
 * **句子拼对了没有**由各端那侧的 `couponRuleText` 用例管（web `coupon-rule.test.ts`）。
 */
describe("couponRate", () => {
    it("十分位与百分比同时给：0.9 是「九折」也是「减 10%」", () => {
        expect(couponRate(0.9)).toEqual({ tenths: "9", percent: "10" })
        expect(couponRate(0.95)).toEqual({ tenths: "9.5", percent: "5" })
    })

    it("去尾：整数十分位不带 .0（0.8 → 8 而不是 8.0）", () => {
        expect(couponRate(0.8)).toEqual({ tenths: "8", percent: "20" })
    })
})

describe("couponReductionRule", () => {
    it("门槛 0 是无门槛（threshold 为 undefined），不是「满 ¥0」", () => {
        expect(couponReductionRule(money(0), money(1000), "zh-CN")).toEqual({
            kind: "reduction",
            threshold: undefined,
            discount: "¥10",
        })
    })

    it("有门槛：门槛与面额都在 fact 里（金额已是 Intl 格式化好的文本）", () => {
        expect(couponReductionRule(money(10000), money(1000), "zh-CN")).toEqual({
            kind: "reduction",
            threshold: "¥100",
            discount: "¥10",
        })
    })

    it("符号跟币种走，不写死 ¥", () => {
        expect(couponReductionRule(money(10000, "USD"), money(1000, "USD"), "en-US")).toEqual({
            kind: "reduction",
            threshold: "$100",
            discount: "$10",
        })
    })
})

describe("couponRule", () => {
    it("满减型走 reduction 分支", () => {
        expect(
            couponRule(money(10000), { type: "FULL_REDUCTION", discount: money(1000) }, "zh-CN"),
        ).toEqual({ kind: "reduction", threshold: "¥100", discount: "¥10" })
    })

    it("折扣型走 rate 分支，带封顶", () => {
        expect(
            couponRule(
                money(10000),
                { type: "DISCOUNT", discountRate: 0.9, maxDiscount: money(5000) },
                "zh-CN",
            ),
        ).toEqual({
            kind: "rate",
            threshold: "¥100",
            rate: { tenths: "9", percent: "10" },
            cap: "¥50",
        })
    })

    it("折扣型无封顶：cap 是 undefined（不是空串，调用点要能分辨「没封顶」）", () => {
        expect(couponRule(money(0), { type: "DISCOUNT", discountRate: 0.8 }, "zh-CN")).toEqual({
            kind: "rate",
            threshold: undefined,
            rate: { tenths: "8", percent: "20" },
            cap: undefined,
        })
    })
})

describe("couponFaceValue", () => {
    it("满减型给金额", () => {
        expect(couponFaceValue({ type: "FULL_REDUCTION", discount: money(1000) }, "zh-CN")).toEqual(
            { kind: "money", text: "¥10" },
        )
    })

    it("折扣型给折扣率的两种表示", () => {
        expect(couponFaceValue({ type: "DISCOUNT", discountRate: 0.9 }, "zh-CN")).toEqual({
            kind: "rate",
            rate: { tenths: "9", percent: "10" },
        })
    })

    it("两者皆无：给 undefined（占位符由调用点出，common 不给「—」那句）", () => {
        expect(couponFaceValue({ type: "FULL_REDUCTION" }, "zh-CN")).toBeUndefined()
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
