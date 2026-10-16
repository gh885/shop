import { type ApiFieldError } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { fieldErrorFact } from "./field-error-fact"

const entry = (over: Partial<ApiFieldError>): ApiFieldError => ({
    field: "name",
    message: "商品标题最长 30 字",
    ...over,
})

/** 422 那一格只产 key+params 的事实，句子留给渲染边界；认不得的 rule / 缺边界一律 undefined（不猜、不印裸槽位） */
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
        expect(fieldErrorFact(entry({ rule: "MAX_LENGTH" }))).toBeUndefined()
        expect(fieldErrorFact(entry({ rule: "MIN" }))).toBeUndefined()
    })

    it("不认识的 rule 返回 undefined（词表外的约束交给调用方降级，不猜一句）", () => {
        expect(fieldErrorFact(entry({ rule: "EMAIL" }))).toBeUndefined()
        // 400 那条通道来的明细根本没有 rule（COM-01 违禁词就是这种）
        expect(fieldErrorFact(entry({}))).toBeUndefined()
    })
})
