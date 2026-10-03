import { describe, expect, it } from "vite-plus/test"

import { shippingTemplateFormFromResponse } from "./model"
import { shippingServerFieldMap } from "./ShippingTemplatePage"

/**
 * 运费模板的服务端路径白名单（嵌套 + 元素级路径那一族）。
 *
 * 钉两条最容易悄悄坏掉的：
 * 1. `excludedRegions[i]` 这种**带下标**的元素级路径要按当前值列全——少列一个下标，那一条 422
 *    就永远落不了地（白名单语义，见 `serverFieldErrorTexts`）；
 * 2. 四格与每条规则的地区选择器都是**真字段**（`FeeTierFields` 逐格 `AppField`），所以
 *    `defaultRule.*` / `regionRules[i].*` 全走恒等映射，服务端那条路径落进它自己那一格。
 *    迁移前这里塌成整块（`defaultRule.*` → `defaultRule`）、`regionRules[i].*` 整族不接——
 *    那是因为那一格不在字段表里，落上去只能到卡片级。列全行号是同一件事：行数变了要跟着变。
 *
 * 这份映射住在页面文件里（而不是 model.ts）：它是**落框决策**（哪一族的错值得标给哪一格），
 * 而 model.ts 管的是换算与校验。
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

    /** 每一行都是一个方括号路径：行数按当前值列全，少一行的话那一条 422 落不了地 */
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
        // 只有现有两行：第 3 行不存在，不猜形状
        expect(map["regionRules[2].firstFee"]).toBeUndefined()
    })
})
