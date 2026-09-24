import { describe, expect, it } from "vitest"

import { MASK_SEGMENT, maskPhone } from "./mask"

describe("maskPhone", () => {
    it("掩掉中间四位：形状与后端 PhoneNumber.mask() 同一份（前 3 + 四星 + 后 4）", () => {
        expect(maskPhone("19551001956")).toBe(`195${MASK_SEGMENT}1956`)
        expect(maskPhone("13800138000")).toBe("138****8000")
    })

    it("位数不足原样返回：宁可不掩也不挪错位置伪造掩码（承运商热线 95543 不是手机号）", () => {
        expect(maskPhone("95543")).toBe("95543")
    })

    it("恰好 7 位起掩：再短就没有「后 4 位」可留", () => {
        expect(maskPhone("1234567")).toBe("123****4567")
    })
})
