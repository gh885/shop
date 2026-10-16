import { describe, expect, it } from "vite-plus/test"

import { serverFieldErrors } from "./server-field-errors"

const apiError = (errors: { field: string; message: string; rule?: string; max?: number }[]) => ({
    status: 422,
    detail: "输入校验失败（1 个字段错误）",
    errors,
})

/** 钉接线形状：产出必须是 key+params 而非句子（提前翻句子的后果只在切语言可见）；落不上框时用户只看到全局 toast */
describe("serverFieldErrors", () => {
    it("按 DTO 字段名落到表单字段名上，产物是 key + params 而不是句子", () => {
        const facts = serverFieldErrors(
            apiError([
                {
                    field: "receiverName",
                    message: "长度不能超过 30 个字符",
                    rule: "MAX_LENGTH",
                    max: 30,
                },
            ]),
            { receiverName: "receiver" },
        )

        expect(facts).toEqual({
            receiver: { message: "validation.MAX_LENGTH", params: { max: 30 } },
        })
        // 这一格不 locale 化：换语言时已显示的错误也要跟着换（§6.1）
        expect(JSON.stringify(facts)).not.toContain("characters")
    })

    it("不给映射时认为两者同名", () => {
        expect(
            serverFieldErrors(
                apiError([{ field: "phone", message: "手机号格式错误", rule: "PATTERN" }]),
            ),
        ).toEqual({ phone: { message: "validation.PATTERN" } })
    })

    it("给了映射就以映射为准：没列出的字段不进结果（宁可全局提示，也不挂到猜出来的框上）", () => {
        const facts = serverFieldErrors(
            apiError([
                { field: "receiverName", message: "太长", rule: "MAX_LENGTH", max: 30 },
                // phone / detail 与表单同名，但这份映射漏了它们 → 那两条错误落不了地（调用方的责任）
                { field: "phone", message: "手机号格式错误", rule: "PATTERN" },
                { field: "detail", message: "太长", rule: "MAX_LENGTH", max: 200 },
                { field: "isDefault", message: "不认识", rule: "PATTERN" },
            ]),
            { receiverName: "receiver" },
        )

        expect(Object.keys(facts)).toEqual(["receiver"])
    })

    it("映射列全了（改名的与同名的都列）时每条都落到位", () => {
        const facts = serverFieldErrors(
            apiError([
                { field: "receiverName", message: "太长", rule: "MAX_LENGTH", max: 30 },
                { field: "phone", message: "手机号格式错误", rule: "PATTERN" },
                { field: "detail", message: "太长", rule: "MAX_LENGTH", max: 200 },
                { field: "isDefault", message: "不认识", rule: "PATTERN" },
            ]),
            { receiverName: "receiver", phone: "phone", detail: "detail" },
        )

        expect(facts).toEqual({
            receiver: { message: "validation.MAX_LENGTH", params: { max: 30 } },
            phone: { message: "validation.PATTERN" },
            detail: { message: "validation.MAX_LENGTH", params: { max: 200 } },
        })
        // isDefault（勾选框，不走字段提示）没列 → 不出现在结果里
        expect(Object.keys(facts)).not.toContain("isDefault")
    })

    it("rule 认不得时给按 locale 的通用校验句（不抄后端中文）", () => {
        expect(
            serverFieldErrors(
                apiError([{ field: "email", message: "邮箱格式错误", rule: "EMAIL" }]),
            ),
        ).toEqual({ email: { message: "error.validation" } })
    })

    it("同一字段多条只取第一条（一个框只显示一句）", () => {
        const facts = serverFieldErrors(
            apiError([
                { field: "name", message: "标题最长 30 字", rule: "MAX_LENGTH", max: 30 },
                { field: "name", message: "标题格式错误", rule: "PATTERN" },
            ]),
        )

        expect(facts).toEqual({ name: { message: "validation.MAX_LENGTH", params: { max: 30 } } })
    })

    it("不是 422 / 没有字段级明细时给空对象（调用方遍历零次）", () => {
        expect(serverFieldErrors({ status: 400, detail: "最多保存 20 条收货地址" })).toEqual({})
        expect(serverFieldErrors({ status: 0, detail: "网络错误" })).toEqual({})
        expect(serverFieldErrors(new Error("boom"))).toEqual({})
    })
})
