import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useCaptcha } from "./use-captcha"

/**
 * 图形验证码的取图 / 刷新。
 *
 * 这里只有一个真判断：`inflight` 那道闸。验证码图片是一次性消费的，连点两下发出两个请求
 * 就会拿到两个 id、界面上留着后到的那个，而用户看到的图属于另一个 id——提交时永远「验证码错误」。
 * 失败路径也要钉：拉图失败后闸门必须重新打开，否则这张图再也刷不出来。
 */

type GetCaptcha = () => Promise<{ captchaId: string; image: string }>

function deferredCaptcha() {
    let resolve!: (value: { captchaId: string; image: string }) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<{ captchaId: string; image: string }>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

function mount(getCaptcha: GetCaptcha) {
    return renderHook(() => useCaptcha(getCaptcha))
}

describe("useCaptcha", () => {
    it("挂载不自己拉图：要不要现在就占一次验证码额度由调用方决定", () => {
        const getCaptcha = vi.fn<GetCaptcha>(async () => ({ captchaId: "c1", image: "img1" }))

        const { result } = mount(getCaptcha)

        expect(getCaptcha).not.toHaveBeenCalled()
        expect(result.current).toMatchObject({ captchaId: "", image: "", loading: false })
    })

    it("连点两次刷新只发一个请求：两个在途响应会让界面上的图和手上的 id 对不上", async () => {
        const gate = deferredCaptcha()
        const getCaptcha = vi.fn<GetCaptcha>(() => gate.promise)
        const { result } = mount(getCaptcha)

        await act(async () => {
            void result.current.refresh()
            void result.current.refresh()
        })

        expect(getCaptcha).toHaveBeenCalledTimes(1)

        await act(async () => gate.resolve({ captchaId: "c1", image: "img1" }))
        expect(result.current).toMatchObject({ captchaId: "c1", image: "img1", loading: false })
    })

    it("拉图失败：清空图片让人看出没加载上，并且能再点一次（闸门没卡死）", async () => {
        const getCaptcha = vi
            .fn<GetCaptcha>()
            .mockRejectedValueOnce(new Error("网络错误"))
            .mockResolvedValueOnce({ captchaId: "c2", image: "img2" })
        const { result } = mount(getCaptcha)

        await act(async () => {
            await result.current.refresh()
        })

        expect(result.current.image).toBe("")
        expect(result.current.loading).toBe(false)

        await act(async () => {
            await result.current.refresh()
        })

        expect(result.current).toMatchObject({ captchaId: "c2", image: "img2" })
    })

    it("换到一张新图：旧 id 已被发码请求消费掉，留着它再发一次必失败", async () => {
        const getCaptcha = vi
            .fn<GetCaptcha>()
            .mockResolvedValueOnce({ captchaId: "c1", image: "img1" })
            .mockResolvedValueOnce({ captchaId: "c2", image: "img2" })
        const { result } = mount(getCaptcha)

        await act(async () => {
            await result.current.refresh()
        })
        await act(async () => {
            result.current.reset()
        })

        await waitFor(() => expect(result.current.captchaId).toBe("c2"))
        expect(getCaptcha).toHaveBeenCalledTimes(2)
    })
})
