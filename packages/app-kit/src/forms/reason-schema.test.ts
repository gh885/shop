import { z } from "zod"
import { describe, expect, it } from "vite-plus/test"

import { reasonSchemaOf } from "./reason-schema"

/**
 * 理由表单的校验：三条都会「改了不报错、用户提交才发现」的规则。
 * 判空看的是 trim 之后（敲满空格不算填了），上限也看 trim 之后（换行缩进不该吃掉预算），
 * 没传 maxLength 时不设上限（调用方自己没口径就别替它编一个）。
 *
 * 消息这一层钉的是**结构化事实**：`message` 是 catalog key、`label`/`max` 在 `params` 里。
 * 句子由渲染边界换，所以这里比 key 与槽位数据，不比中文——比中文就等于把 locale 焊进 schema。
 */

const schema = reasonSchemaOf("拒绝理由", 20)

/** zod 只在 `custom` 那条 issue 上挂 `params`（refine/superRefine 走这条），check 类 issue 没这字段 */
const paramsOf = (issue: z.ZodIssue | undefined) =>
    issue?.code === "custom" ? issue.params : undefined

describe("reasonSchemaOf", () => {
    it("正常填写_通过，且交出的是 trim 后的值", () => {
        const parsed = schema.safeParse({ reason: "  商品与描述不符  " })

        expect(parsed.success).toBe(true)
        expect(parsed.data?.reason).toBe("商品与描述不符")
    })

    it("只有空格换行_不通过_报「必填」那条而不是「最长」，且把字段名作为数据交出去", () => {
        const issue = reasonSchemaOf("取消原因").safeParse({ reason: " \n  " }).error?.issues[0]

        expect(issue?.message).toBe("appKit.form.reasonRequired")
        expect(paramsOf(issue)).toEqual({ label: "取消原因" })
    })

    it("恰好填满_通过：上限是闭区间", () => {
        expect(schema.safeParse({ reason: "x".repeat(20) }).success).toBe(true)
    })

    it("超一字_不通过_上限作为数据交出去（`.max()` 会把 params 丢掉，句子填不上 {max}）", () => {
        const issue = schema.safeParse({ reason: "x".repeat(21) }).error?.issues[0]

        expect(issue?.message).toBe("appKit.form.reasonMaxLength")
        expect(paramsOf(issue)).toEqual({ label: "拒绝理由", max: 20 })
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
