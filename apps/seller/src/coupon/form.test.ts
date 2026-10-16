import { money } from "@shop/common/domain"
import { describe, expect, it } from "vite-plus/test"

import { couponRequestFromForm, type CouponFormValues } from "./form"

// 元≠分（100 元券会变 1 元券）、本地墙钟≠带时区 ISO（原样发会 400），这两类投影错必须能红
function makeValues(overrides: Partial<CouponFormValues> = {}): CouponFormValues {
    return {
        name: "  新春满减券  ",
        type: "FULL_REDUCTION",
        thresholdYuan: "100",
        discountYuan: "10",
        discountRate: "",
        maxDiscountYuan: "",
        totalQuantity: "50",
        validFrom: "2026-01-01T10:00",
        validTo: "2026-02-01T10:00",
        validDays: "",
        ...overrides,
    }
}

describe("couponRequestFromForm", () => {
    it("元换算成分：门槛 100 元、面额 10 元变成 10000 / 1000 的 Money，券名去掉首尾空白", () => {
        const request = couponRequestFromForm(makeValues())

        expect(request).toMatchObject({
            name: "新春满减券",
            thresholdAmount: money(10000),
            discountAmount: money(1000),
            totalQuantity: 50,
        })
    })

    it("门槛填 0：按毛额原样提交 0（无门槛），而不是被当成缺填丢掉", () => {
        const request = couponRequestFromForm(makeValues({ thresholdYuan: "0" }))

        expect(request.thresholdAmount).toEqual(money(0))
    })

    it("小数金额按分取整：9.9 元 = 990 分", () => {
        const request = couponRequestFromForm(makeValues({ discountYuan: "9.9" }))

        expect(request.discountAmount).toEqual(money(990))
    })

    it("有效期：本地墙钟转成带时区的 ISO 时刻（同一瞬间，不是原样的本地字符串）", () => {
        const request = couponRequestFromForm(makeValues())

        expect(request.validFrom).toMatch(/Z$/)
        expect(Date.parse(request.validFrom)).toBe(Date.parse("2026-01-01T10:00"))
        expect(Date.parse(request.validTo)).toBe(Date.parse("2026-02-01T10:00"))
    })

    it("金额非法时拒绝投影，不发出一张金额说不清的券", () => {
        expect(() => couponRequestFromForm(makeValues({ discountYuan: "abc" }))).toThrow(
            "面额格式不正确",
        )
    })
})
