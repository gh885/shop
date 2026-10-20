import { describe, expect, it } from "vite-plus/test"

import { shippingTemplateFormFromResponse } from "./rules"
import { shippingServerFieldMap } from "./ShippingTemplatePage"

function formWithExcluded(count: number) {
    const values = shippingTemplateFormFromResponse(undefined)
    values.excludedRegions = Array.from({ length: count }, (_unused, i) => String(330000 + i))
    return values
}

const mapOf = (count = 0) =>
    shippingServerFieldMap(
        count ? formWithExcluded(count) : shippingTemplateFormFromResponse(undefined),
    )

describe("shippingServerFieldMap", () => {
    it("容器级与元素级路径都落在同一个地区选择器上，且按当前值列全下标", () => {
        const map = mapOf(3)

        expect(map.excludedRegions).toBe("excludedRegions")
        expect(map["excludedRegions[0]"]).toBe("excludedRegions")
        expect(map["excludedRegions[2]"]).toBe("excludedRegions")
        expect(map["excludedRegions[3]"]).toBeUndefined()
    })

    it("没有不配送地区时不列任何带下标的路径（白名单不猜形状）", () => {
        expect(Object.keys(mapOf()).filter((k) => k.startsWith("excludedRegions["))).toHaveLength(0)
    })

    it("默认运费那四格恒等落进自己那一格（Money 的 .amount 也认）", () => {
        const map = mapOf()

        expect(map["defaultRule.firstQuantity"]).toBe("defaultRule.firstQuantity")
        expect(map["defaultRule.addQuantity"]).toBe("defaultRule.addQuantity")
        expect(map["defaultRule.firstFee"]).toBe("defaultRule.firstFee")
        expect(map["defaultRule.firstFee.amount"]).toBe("defaultRule.firstFee")
        expect(map["defaultRule.addFee.amount"]).toBe("defaultRule.addFee")
        expect(map["freeOverAmount.amount"]).toBe("freeOverAmount")
        expect(map["freeOverQuantity"]).toBe("freeOverQuantity")
    })

    it("regionRules 逐行逐格恒等，含那格覆盖地区", () => {
        const values = shippingTemplateFormFromResponse(undefined)
        values.regionRules = [
            { id: "r1", regionPrefixes: ["440000"], ...values.defaultRule },
            { id: "r2", regionPrefixes: ["110000"], ...values.defaultRule },
        ]

        const map = shippingServerFieldMap(values)

        expect(map["regionRules[0].firstFee.amount"]).toBe("regionRules[0].firstFee")
        expect(map["regionRules[1].addQuantity"]).toBe("regionRules[1].addQuantity")
        expect(map["regionRules[1].regionPrefixes"]).toBe("regionRules[1].regionPrefixes")
        expect(map["regionRules[2].firstFee"]).toBeUndefined()
    })
})
