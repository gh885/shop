import { z } from "zod"

import { describe, expect, it } from "vitest"

import { apiErrorDetail, RESPONSE_VALIDATION_FAILED, toApiError, zodIssuesText } from "./api-error"

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
        expect(text).toContain("; ") // 多条 issue 用分号连接成一行
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

describe("apiErrorDetail", () => {
    it("后端给了话才用它的 detail", () => {
        expect(apiErrorDetail(makeApiError({ detail: "店铺已打烊" }), "商品流加载失败")).toBe(
            "店铺已打烊",
        )
    })

    it("网络层异常回站点那句：不写 `toApiError(err).detail || 站点文案`，那条恒为通用兜底", () => {
        const err = new TypeError("Failed to fetch")
        expect(toApiError(err).detail).not.toBe("") // 反例的前提：归一化给的是非空通用话
        expect(apiErrorDetail(err, "商品流加载失败")).toBe("商品流加载失败")
    })

    it("契约校验失败（ZodError）与缺字段的对象都不算 ApiError，一并回站点那句", () => {
        expect(apiErrorDetail(new z.ZodError([invalidTypeIssue([])]), "活动位加载失败")).toBe(
            "活动位加载失败",
        )
        expect(apiErrorDetail({ status: 500 }, "活动位加载失败")).toBe("活动位加载失败")
    })
})
