import { describe, expect, it } from "vite-plus/test"

import { shippingTemplateFormFromResponse } from "./model"
import { shippingServerFieldMap } from "./ShippingTemplatePage"

/**
 * 运费模板的服务端路径白名单（嵌套 + 元素级路径那一族）。
 *
 * 钉两条最容易悄悄坏掉的：
 * 1. `excludedRegions[i]` 这种**带下标**的元素级路径要按当前值列全——少列一个下标，那一条 422
 *    就永远落不了地（白名单语义，见 `serverFieldErrorTexts`）；
 * 2. `regionRules[i].*` 刻意不进白名单：整个数组是一个字段，落上去就是「第 3 条规则的错显示在列表末尾」，
 *    而那句话里没有「第几条」——落错框比不落框更难排查。
 *
 * 这份映射住在页面文件里（而不是 model.ts）：它是**落框决策**（哪一族的错值得标给哪一块），
 * 而 model.ts 管的是换算与校验；同页那两个错误位（默认运费、不配送地区）才是它的另一半。
 */

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

    it("嵌套的费用档落到「默认运费」那一块（Money 的 .amount 也认）", () => {
        const map = mapOf()

        expect(map["defaultRule.firstQuantity"]).toBe("defaultRule")
        expect(map["defaultRule.firstFee.amount"]).toBe("defaultRule")
        expect(map["freeOverAmount.amount"]).toBe("freeOverAmount")
        expect(map["freeOverQuantity"]).toBe("freeOverQuantity")
    })

    /** 每条地区规则的四格不是表单字段（整个数组才是一个字段），逐条规则没有可标的框 */
    it("regionRules 整族不接，兜底仍是那句带路径的全局提示", () => {
        const values = shippingTemplateFormFromResponse(undefined)
        values.regionRules = [
            { id: "r1", regionPrefixes: ["440000"], ...values.defaultRule },
            { id: "r2", regionPrefixes: ["110000"], ...values.defaultRule },
        ]

        const keys = Object.keys(shippingServerFieldMap(values))
        expect(keys.filter((k) => k.startsWith("regionRules"))).toHaveLength(0)
    })
})
