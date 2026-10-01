import { type ApiFieldError } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { fieldErrorText } from "./field-error-text"

const LOCALES = ["zh-CN", "en-US"] as const

const entry = (over: Partial<ApiFieldError>): ApiFieldError => ({
    field: "name",
    message: "商品标题最长 30 字",
    ...over,
})

/**
 * 422 那一格的取文案：后端给 `rule`（+ 边界），句子由 catalog 按界面语言出（i18n.md §7.3 代价 2）。
 *
 * 钉的是三件事：**认得的规则出本地化句子**（不是后端那句中文）、**认不得的返回 undefined**
 * （调用方自己降级，不在这里猜）、**边界缺失时不印裸槽位**。
 */
describe("fieldErrorText", () => {
    it.each([
        ["MAX_LENGTH", { max: 30 }, "30"],
        ["MIN_LENGTH", { min: 10 }, "10"],
        ["MIN", { min: 1 }, "1"],
        ["MAX", { max: 99.5 }, "99.5"],
    ])("%s：句子里的数字来自后端的边界，两种语言都不是那句中文", (rule, bounds, shown) => {
        for (const locale of LOCALES) {
            const text = fieldErrorText(
                entry({ rule, ...(bounds as { min?: number; max?: number }) }),
                locale,
            )
            expect(text).toBeTruthy()
            expect(text).not.toBe("商品标题最长 30 字")
            expect(text).toContain(shown)
            expect(text).not.toContain("{")
        }
    })

    it.each([
        ["REQUIRED", {}],
        ["PATTERN", {}],
    ])("%s：没有边界的规则直接出那一句", (rule) => {
        for (const locale of LOCALES) {
            const text = fieldErrorText(entry({ rule }), locale)
            expect(text).toBeTruthy()
            expect(text).not.toContain("{")
        }
    })

    it("边界缺失时不给句子（返回 undefined 而不是把裸槽位印出去）", () => {
        // catalog 那几句永远带槽位，缺参数时 formatMessage 会原样返回模板 —— 也就是把 `{max}` 印出去。
        // 所以这条是「没有就不给」，调用方降级，而不是就地拼一句不带数字的
        for (const locale of LOCALES) {
            expect(fieldErrorText(entry({ rule: "MAX_LENGTH" }), locale)).toBeUndefined()
            expect(fieldErrorText(entry({ rule: "MIN" }), locale)).toBeUndefined()
        }
    })

    it("不认识的 rule 返回 undefined（词表外的约束交给调用方降级，不猜一句）", () => {
        expect(fieldErrorText(entry({ rule: "EMAIL" }), "zh-CN")).toBeUndefined()
        // 400 那条通道来的明细根本没有 rule（COM-01 违禁词就是这种）
        expect(fieldErrorText(entry({}), "zh-CN")).toBeUndefined()
    })
})
