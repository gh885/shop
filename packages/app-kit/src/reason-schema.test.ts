import { describe, expect, it } from "vitest"

import { reasonSchemaOf } from "./reason-schema"

/**
 * 理由表单的校验：三条都会「改了不报错、用户提交才发现」的规则。
 * 判空看的是 trim 之后（敲满空格不算填了），上限也看 trim 之后（换行缩进不该吃掉预算），
 * 没传 maxLength 时不设上限（调用方自己没口径就别替它编一个）。
 */

const schema = reasonSchemaOf("拒绝理由", 20)

describe("reasonSchemaOf", () => {
    it("正常填写_通过，且交出的是 trim 后的值", () => {
        const parsed = schema.safeParse({ reason: "  商品与描述不符  " })

        expect(parsed.success).toBe(true)
        expect(parsed.data?.reason).toBe("商品与描述不符")
    })

    it("只有空格换行_不通过_报「请填写」而不是「最长」", () => {
        const parsed = reasonSchemaOf("取消原因").safeParse({ reason: " \n  " })

        expect(parsed.success).toBe(false)
        expect(parsed.error?.issues[0]?.message).toBe("请填写取消原因")
    })

    it("恰好填满_通过：上限是闭区间", () => {
        expect(schema.safeParse({ reason: "x".repeat(20) }).success).toBe(true)
    })

    it("超一字_不通过_提示语把上限报出来", () => {
        const parsed = schema.safeParse({ reason: "x".repeat(21) })

        expect(parsed.success).toBe(false)
        expect(parsed.error?.issues[0]?.message).toBe("拒绝理由最长 20 字")
    })

    it("带首尾空格的超长串_按 trim 后计长：填进去的空格不该算进预算", () => {
        expect(schema.safeParse({ reason: `   ${"x".repeat(20)}   ` }).success).toBe(true)
    })

    it("不传 maxLength_不设上限，只要求非空", () => {
        const uncapped = reasonSchemaOf("备注")

        expect(uncapped.safeParse({ reason: "y".repeat(500) }).success).toBe(true)
        expect(uncapped.safeParse({ reason: "" }).success).toBe(false)
    })
})
