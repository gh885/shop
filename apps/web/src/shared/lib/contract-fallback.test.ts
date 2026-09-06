import { z } from "zod"
import { describe, expect, it, vi } from "vitest"

import { withContractFallback } from "./contract-fallback"

/**
 * 契约漂移降级帮手：只吞「2xx 但 payload 不符合契约」的读错误，其余错误语义照常抛。
 * 关键分界：dev（测试即非 PROD）强抛尽早暴露问题；PROD 才降级兜底。
 */

function makeZodError(): unknown {
    return new z.ZodError([
        { code: "invalid_type", expected: "string", path: [], message: "Required" } as never,
    ])
}

describe("withContractFallback", () => {
    it("契约漂移错误在 PROD 下返回兜底数据", async () => {
        vi.stubEnv("PROD", true)
        const queryFn = vi.fn<() => Promise<string>>(async () => {
            throw makeZodError()
        })
        const wrapped = withContractFallback(queryFn, () => "fallback")

        await expect(wrapped()).resolves.toBe("fallback")
        vi.unstubAllEnvs()
    })

    it("非 PROD（dev）下契约漂移强抛，不吞问题", async () => {
        vi.stubEnv("PROD", false)
        const queryFn = async () => {
            throw makeZodError()
        }

        await expect(withContractFallback(queryFn, () => "fallback")()).rejects.toBeTruthy()
        vi.unstubAllEnvs()
    })

    it("普通业务错误（404/网络等）即使 PROD 也照常抛，语义不被吞", async () => {
        vi.stubEnv("PROD", true)
        const businessError = { status: 404, detail: "商品不存在" }
        const queryFn = async () => {
            throw businessError
        }

        await expect(withContractFallback(queryFn, () => "fallback")()).rejects.toBe(businessError)
        vi.unstubAllEnvs()
    })

    it("成功路径原样透传结果，不走兜底", async () => {
        const wrapped = withContractFallback(
            async () => "real-data",
            () => "fallback",
        )

        await expect(wrapped()).resolves.toBe("real-data")
    })
})
