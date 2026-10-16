import { z } from "zod"

import { describe, expect, it } from "vite-plus/test"

import { RESPONSE_VALIDATION_FAILED, toApiError, zodIssuesText } from "./api-error"

/** 契约级假数据：ApiError 形状的合法构造（过 ApiErrorSchema 的 zod 语义） */
function makeApiError(
    overrides: Partial<{ status: number; detail: string; code?: string; requestId?: string }> = {},
) {
    return { status: 400, detail: "请求参数错误", ...overrides }
}

/** 构造最小合法 ZodIssue（invalid_type 成员）：夹具过 zod 类型语义，不手写 as never */
function invalidTypeIssue(
    path: PropertyKey[],
    expected = "string",
    message = "Required",
): z.ZodIssue {
    return { code: "invalid_type", expected, path, message }
}

describe("zodIssuesText", () => {
    it("把 issues 压成一行：path + message，空 path 显示 (root)", () => {
        const err = new z.ZodError([
            invalidTypeIssue(["receiver", "name"]),
            invalidTypeIssue([], "number"),
        ])
        const text = zodIssuesText(err)

        expect(text).toContain("receiver.name: Required")
        expect(text).toContain("(root): Required")
        expect(text).toContain("; ")
    })
})

describe("toApiError", () => {
    it("ZodError 归一化为 HTTP 200 + RESPONSE_VALIDATION_FAILED（payload 契约漂移，非传输失败）", () => {
        const err = new z.ZodError([invalidTypeIssue([])])

        expect(toApiError(err)).toMatchObject({
            status: 200,
            code: RESPONSE_VALIDATION_FAILED,
            detail: "响应数据不符合接口契约",
        })
    })

    it("已是 ApiError 形状的错误透传 code/requestId，status 非数字兜底 0", () => {
        expect(
            toApiError(makeApiError({ status: 409, code: "SMS_CODE_EXPIRED", requestId: "req-1" })),
        ).toEqual({
            status: 409,
            detail: "请求参数错误",
            code: "SMS_CODE_EXPIRED",
            requestId: "req-1",
        })
        expect(toApiError({ detail: "x", status: "weird" }).status).toBe(0)
    })

    it("网络层等未知异常拢成 status 0 的通用错误，不带 code", () => {
        expect(toApiError(new Error("boom"))).toEqual({
            status: 0,
            detail: "请求失败，请稍后重试",
        })
        expect(toApiError("string error")).toEqual({ status: 0, detail: "请求失败，请稍后重试" })
        expect(toApiError(null).code).toBeUndefined()
    })

    it("缺 detail 的对象不算 ApiError 形状，走未知异常兜底", () => {
        expect(toApiError({ status: 500 }).detail).toBe("请求失败，请稍后重试")
    })
})

/** 422 字段级明细（后端挂在 ProblemDetail 扩展属性上）：schema 声明了这格，归一化不接回来调用方按它分支永远拿不到东西 */
describe("toApiError 接回字段级明细 errors", () => {
    it("原样透传 [{field, message}]：字段名留给调用方标红，句子仍归那条链", () => {
        expect(
            toApiError({
                status: 422,
                detail: "输入校验失败（2 个字段错误）",
                errors: [
                    { field: "name", message: "商品标题最长 30 字" },
                    { field: "price", message: "价格必须大于 0" },
                ],
            }).errors,
        ).toEqual([
            { field: "name", message: "商品标题最长 30 字" },
            { field: "price", message: "价格必须大于 0" },
        ])
    })

    it("脏条目与空数组当没有：漏到界面上就是标错字段、句子没有谓语", () => {
        expect(toApiError({ status: 422, detail: "x", errors: [] }).errors).toBeUndefined()
        expect(toApiError({ status: 422, detail: "x", errors: "乱码" }).errors).toBeUndefined()
        expect(
            toApiError({ status: 422, detail: "x", errors: [{ field: 1, message: "y" }] }).errors,
        ).toBeUndefined()
        // 只收干净的那条，不因为一条脏的就整格丢掉（后端多写一个字段不该让已知的字段错误消失）
        expect(
            toApiError({
                status: 422,
                detail: "x",
                errors: [{ field: "name", message: "必填" }, { field: "price" }],
            }).errors,
        ).toEqual([{ field: "name", message: "必填" }])
    })

    it("value 是那条规则作用到的数据：COM-01 靠它把句子参数化，不用从中文 detail 里捞", () => {
        expect(
            toApiError({
                status: 400,
                detail: "「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交",
                code: "FORBIDDEN_WORD_HIT",
                errors: [
                    {
                        field: "name",
                        message: "「标题」包含违禁词「最佳」",
                        value: "最佳",
                        extra: 1,
                    },
                ],
            }).errors,
        ).toEqual([{ field: "name", message: "「标题」包含违禁词「最佳」", value: "最佳" }])
        // 声明的三格之外不留第四格：ApiError 会进上报，漏进去的键等于给监控一个没人声明的形状
    })
})

/** 结构化上下文那一格：地址上限住在后端常量里、前端无对边，只能靠 params 把数字当数据收回给 catalog 的 {limit}；白名单重建同 errors 口径 */
describe("toApiError 接回结构化上下文 params", () => {
    it("标量值原样透出（数字上限正是它的首个用例）", () => {
        expect(
            toApiError({
                status: 400,
                detail: "最多保存 20 条收货地址",
                code: "ADDRESS_LIMIT_EXCEEDED",
                params: { limit: 20 },
            }).params,
        ).toEqual({ limit: 20 })
    })

    it("对象 / 数组 / null 值丢掉，空对象当没有", () => {
        expect(
            toApiError({
                status: 400,
                detail: "x",
                params: { limit: 20, nested: { a: 1 }, list: [1], nothing: null },
            }).params,
        ).toEqual({ limit: 20 })
        expect(toApiError({ status: 400, detail: "x", params: {} }).params).toBeUndefined()
        expect(toApiError({ status: 400, detail: "x", params: [1] }).params).toBeUndefined()
        expect(toApiError({ status: 400, detail: "x" }).params).toBeUndefined()
    })
})
