import { z } from "zod"

import { describe, expect, it } from "vitest"

import {
    RESPONSE_VALIDATION_FAILED,
    isContractViolation,
    toApiError,
    zodIssuesText,
} from "./api-error"

/** 契约级假数据：ApiError 形状的合法构造（过 ApiErrorSchema 的 zod 语义） */
function makeApiError(
    overrides: Partial<{ status: number; detail: string; code?: string; requestId?: string }> = {},
) {
    return { status: 400, detail: "请求参数错误", ...overrides }
}

describe("isContractViolation", () => {
    it("裸 ZodError 是契约漂移", () => {
        const err = new z.ZodError([
            {
                code: "invalid_type",
                expected: "string",
                path: ["name"],
                message: "Required",
            } as never,
        ])
        expect(isContractViolation(err)).toBe(true)
    })

    it("已归一化的 RESPONSE_VALIDATION_FAILED ApiError 是契约漂移", () => {
        expect(
            isContractViolation({ status: 200, detail: "x", code: RESPONSE_VALIDATION_FAILED }),
        ).toBe(true)
    })

    it("普通业务错误与其它 code 不是契约漂移", () => {
        expect(isContractViolation(makeApiError())).toBe(false)
        expect(isContractViolation({ status: 404, detail: "x", code: "OTHER_CODE" })).toBe(false)
        expect(isContractViolation(new Error("boom"))).toBe(false)
        expect(isContractViolation(null)).toBe(false)
        expect(isContractViolation(undefined)).toBe(false)
    })
})

describe("zodIssuesText", () => {
    it("把 issues 压成一行：path + message，空 path 显示 (root)", () => {
        const err = new z.ZodError([
            {
                code: "invalid_type",
                expected: "string",
                path: ["receiver", "name"],
                message: "Required",
            } as never,
            { code: "invalid_type", expected: "number", path: [], message: "Required" } as never,
        ])
        const text = zodIssuesText(err)

        expect(text).toContain("receiver.name: Required")
        expect(text).toContain("(root): Required")
        expect(text).toContain("; ") // 多条 issue 用分号连接成一行
    })
})

describe("toApiError", () => {
    it("ZodError 归一化为 HTTP 200 + RESPONSE_VALIDATION_FAILED（payload 契约漂移，非传输失败）", () => {
        const err = new z.ZodError([
            { code: "invalid_type", expected: "string", path: [], message: "Required" } as never,
        ])

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
        expect(toApiError(new Error("boom"))).toEqual({ status: 0, detail: "请求失败，请稍后重试" })
        expect(toApiError("string error")).toEqual({ status: 0, detail: "请求失败，请稍后重试" })
        expect(toApiError(null).code).toBeUndefined()
    })

    it("缺 detail 的对象不算 ApiError 形状，走未知异常兜底", () => {
        expect(toApiError({ status: 500 }).detail).toBe("请求失败，请稍后重试")
    })
})
