import { type ApiFieldError } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { fieldErrorFact } from "./field-error-fact"

const entry = (over: Partial<ApiFieldError>): ApiFieldError => ({
    field: "name",
    message: "商品标题最长 30 字",
    ...over,
})

/**
 * 422 那一格的取事实：后端给 `rule`（+ 边界），这里只产出 key + params，句子在渲染边界按当前语言出
 * 。
 *
 * 钉的是三件事：**认得的规则出可本地化的事实**（不是后端那句中文，也不是这里就翻好的句子）、
 * **认不得的返回 undefined**（调用方自己降级，不在这里猜）、**边界缺失时不给事实**（不印裸槽位）。
 */
describe("fieldErrorFact", () => {
    it.each([
        ["MAX_LENGTH", { max: 30 }],
        ["MIN_LENGTH", { min: 10 }],
        ["MIN", { min: 1 }],
        ["MAX", { max: 99.5 }],
    ])("%s：槽位里的数字来自后端的边界，这里不出现任何语言的自然语言", (rule, bounds) => {
        const fact = fieldErrorFact(entry({ rule, ...(bounds as { min?: number; max?: number }) }))

        expect(fact).toBeDefined()
        expect(fact?.message).toMatch(/^validation\./)
        // 不带边界的 key 与带边界的那条对不上（例如 MAX_LENGTH 必带 max），少传就红
        expect(fact?.params).toEqual(bounds)
        expect(JSON.stringify(fact)).not.toContain("字")
    })

    it.each([
        ["REQUIRED", {}],
        ["PATTERN", {}],
    ])("%s：没有边界的规则不带 params", (rule) => {
        const fact = fieldErrorFact(entry({ rule }))

        expect(fact).toEqual({ message: `validation.${rule}` })
        expect(fact?.params).toBeUndefined()
    })

    it("边界缺失时不给事实（返回 undefined 而不是把裸槽位印出去）", () => {
        // catalog 那几句永远带槽位，缺参数时 旧实现曾返回原样模板 —— 也就是把 `{max}` 印出去。
        // 所以这条是「没有就不给」，调用方降级，而不是就地拼一句不带数字的
        expect(fieldErrorFact(entry({ rule: "MAX_LENGTH" }))).toBeUndefined()
        expect(fieldErrorFact(entry({ rule: "MIN" }))).toBeUndefined()
    })

    it("不认识的 rule 返回 undefined（词表外的约束交给调用方降级，不猜一句）", () => {
        expect(fieldErrorFact(entry({ rule: "EMAIL" }))).toBeUndefined()
        // 400 那条通道来的明细根本没有 rule（COM-01 违禁词就是这种）
        expect(fieldErrorFact(entry({}))).toBeUndefined()
    })
})
