import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { scrollToElement, scrollToTop } from "./scroll"

/** common 的测试跑在 node 环境（纯逻辑不塞 jsdom），所以只 stub 用到的那两个全局对象 */
function mockMotionPreference(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && reduce,
    }))
}

function mockWindowScrollTo() {
    const scrollTo = vi.fn<(options: ScrollToOptions) => void>()
    vi.stubGlobal("window", { scrollTo })
    return scrollTo
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("scrollToTop", () => {
    it("默认平滑滚动", () => {
        mockMotionPreference(false)
        const scrollTo = mockWindowScrollTo()

        scrollToTop()

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
    })

    it("用户要求减少动效时瞬时到位：JS 写死的 smooth 会盖过 CSS 兜底，门控只能在取值这层", () => {
        mockMotionPreference(true)
        const scrollTo = mockWindowScrollTo()

        scrollToTop()

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" })
    })
})

describe("scrollToElement", () => {
    it("滚到锚点，减少动效下同样瞬时", () => {
        mockMotionPreference(true)
        const scrollIntoView = vi.fn<(options: ScrollIntoViewOptions) => void>()
        vi.stubGlobal("document", { getElementById: () => ({ scrollIntoView }) })

        scrollToElement("params")

        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" })
    })

    it("锚点不在（占位路由、区块未渲染）时什么都不做", () => {
        mockMotionPreference(false)
        const scrollIntoView = vi.fn<(options: ScrollIntoViewOptions) => void>()
        vi.stubGlobal("document", { getElementById: () => null })

        scrollToElement("nope")

        expect(scrollIntoView).not.toHaveBeenCalled()
    })
})
