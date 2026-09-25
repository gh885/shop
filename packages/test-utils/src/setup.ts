// oxlint-disable-next-line import/no-unassigned-import -- jest-dom 匹配器注册副作用
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, vi } from "vitest"

import { server } from "./msw-server"

/**
 * jsdom 不实现这些浏览器观察 API。测试装置只补平台能力，不伪造业务模块；
 * 需要观察器实例行为的用例仍可在自己的 beforeEach 中覆盖全局实现。
 */
export function installDomStubs() {
    Object.defineProperty(window, "scrollTo", {
        configurable: true,
        value: vi.fn<() => void>(),
        writable: true,
    })
    Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        value: class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
        writable: true,
    })
}

/**
 * 测试环境装配：jest-dom 匹配器 + MSW server + RTL 自动清理。
 * 各 app 的 vitest setupFiles 里调用一次（jsdom 环境的 suite）。
 */
export function setupTests() {
    beforeAll(() => {
        installDomStubs()
        server.listen({ onUnhandledRequest: "error" })
    })
    afterEach(() => {
        server.resetHandlers()
        cleanup()
    })
    afterAll(() => server.close())
}
