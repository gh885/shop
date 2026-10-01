import { describe, expect, it } from "vite-plus/test"

import { serverFieldErrorTexts } from "./server-field-errors"

/** 一条 422：字段级明细 + rule（后端注解翻出来的），message 是那句成品中文 */
const apiError = (errors: { field: string; message: string; rule?: string; max?: number }[]) => ({
    status: 422,
    detail: "输入校验失败（1 个字段错误）",
    errors,
})

/**
 * 422 的字段级明细 → 表单字段名 → 那句话（这条通道的前端一半）。
 *
 * 钉的是**接线**而不是文案：文案由 `fieldErrorText` 那组用例管。这里管的是「后端说的那个字段
 * 能不能落到表单上那个框」——落不上时用户只看到一句全局 toast，而那种错最难排查。
 */
describe("serverFieldErrorTexts", () => {
    it("按 DTO 字段名落到表单字段名上，句子是本地化的那句", () => {
        const texts = serverFieldErrorTexts(
            apiError([
                {
                    field: "receiverName",
                    message: "长度不能超过 30 个字符",
                    rule: "MAX_LENGTH",
                    max: 30,
                },
            ]),
            "en-US",
            { receiverName: "receiver" },
        )

        expect(texts).toEqual({ receiver: "Must be at most 30 characters." })
    })

    it("不给映射时认为两者同名", () => {
        expect(
            serverFieldErrorTexts(
                apiError([{ field: "phone", message: "手机号格式错误", rule: "PATTERN" }]),
                "zh-CN",
            ),
        ).toEqual({ phone: "格式不对" })
    })

    it("给了映射就以映射为准：没列出的字段不进结果（宁可全局提示，也不挂到猜出来的框上）", () => {
        const texts = serverFieldErrorTexts(
            apiError([
                { field: "receiverName", message: "太长", rule: "MAX_LENGTH", max: 30 },
                // phone / detail 与表单同名，但这份映射漏了它们 → 那两条错误落不了地（调用方的责任）
                { field: "phone", message: "手机号格式错误", rule: "PATTERN" },
                { field: "detail", message: "太长", rule: "MAX_LENGTH", max: 200 },
                { field: "isDefault", message: "不认识", rule: "PATTERN" },
            ]),
            "zh-CN",
            { receiverName: "receiver" },
        )

        expect(Object.keys(texts)).toEqual(["receiver"])
    })

    it("映射列全了（改名的与同名的都列）时每条都落到位", () => {
        const texts = serverFieldErrorTexts(
            apiError([
                { field: "receiverName", message: "太长", rule: "MAX_LENGTH", max: 30 },
                { field: "phone", message: "手机号格式错误", rule: "PATTERN" },
                { field: "detail", message: "太长", rule: "MAX_LENGTH", max: 200 },
                { field: "isDefault", message: "不认识", rule: "PATTERN" },
            ]),
            "en-US",
            { receiverName: "receiver", phone: "phone", detail: "detail" },
        )

        expect(texts).toEqual({
            receiver: "Must be at most 30 characters.",
            phone: "Invalid format.",
            detail: "Must be at most 200 characters.",
        })
        // isDefault（勾选框，不走字段提示）没列 → 不出现在结果里
        expect(Object.keys(texts)).not.toContain("isDefault")
    })

    it("rule 认不得时退回后端那句中文（兜底，不是常态）", () => {
        expect(
            serverFieldErrorTexts(
                apiError([{ field: "email", message: "邮箱格式错误", rule: "EMAIL" }]),
                "en-US",
            ),
        ).toEqual({ email: "邮箱格式错误" })
    })

    it("同一字段多条只取第一条（一个框只显示一句）", () => {
        const texts = serverFieldErrorTexts(
            apiError([
                { field: "name", message: "标题最长 30 字", rule: "MAX_LENGTH", max: 30 },
                { field: "name", message: "标题格式错误", rule: "PATTERN" },
            ]),
            "zh-CN",
        )

        expect(texts).toEqual({ name: "最长 30 个字" })
    })

    it("不是 422 / 没有字段级明细时给空对象（调用方遍历零次）", () => {
        expect(
            serverFieldErrorTexts({ status: 400, detail: "最多保存 20 条收货地址" }, "zh-CN"),
        ).toEqual({})
        expect(serverFieldErrorTexts({ status: 0, detail: "网络错误" }, "zh-CN")).toEqual({})
        expect(serverFieldErrorTexts(new Error("boom"), "zh-CN")).toEqual({})
    })
})
