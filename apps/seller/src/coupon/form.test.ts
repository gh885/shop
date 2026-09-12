import { describe, expect, it } from "vitest"

import { couponRequestFromForm, type CouponFormValues } from "./form"

/**
 * 「表单形状 → 后端请求」的投影测试。
 *
 * 单位与时间格式是唯一会在这里出错的地方：元当成分提交会让 100 元券变成 1 元券；
 * 本地墙钟字符串直接发给 OffsetDateTime 会 400。这两条都必须能红。
 */

function makeValues(overrides: Partial<CouponFormValues> = {}): CouponFormValues {
    return {
        name: "  新春满减券  ",
        thresholdYuan: "100",
        discountYuan: "10",
        totalQuantity: "50",
        validFrom: "2026-01-01T10:00",
        validTo: "2026-02-01T10:00",
        ...overrides,
    }
}

describe("couponRequestFromForm", () => {
    it("元换算成分：门槛 100 元、面额 10 元变成 10000 / 1000，券名去掉首尾空白", () => {
        const request = couponRequestFromForm(makeValues())

        expect(request).toMatchObject({
            name: "新春满减券",
            thresholdAmount: 10000,
            discountAmount: 1000,
            totalQuantity: 50,
        })
    })

    it("门槛填 0：按毛额原样提交 0（无门槛），而不是被当成缺填丢掉", () => {
        const request = couponRequestFromForm(makeValues({ thresholdYuan: "0" }))

        expect(request.thresholdAmount).toBe(0)
    })

    it("小数金额按分取整：9.9 元 = 990 分", () => {
        const request = couponRequestFromForm(makeValues({ discountYuan: "9.9" }))

        expect(request.discountAmount).toBe(990)
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
