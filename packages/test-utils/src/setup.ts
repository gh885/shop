// oxlint-disable-next-line import/no-unassigned-import -- jest-dom 匹配器注册副作用
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, vi } from "vite-plus/test"

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
    /**
     * Base UI 的两条 WAAPI 需求在 jsdom 里互相冲突，必须成对给：
     * - ScrollArea 视口无条件调 `viewport.getAnimations({subtree: true})`，jsdom 没有 WAAPI
     *   → 每次挂载都在库内部定时器里抛未捕获 TypeError，所以要补一个返回空数组的实现；
     * - 但 Popup / Dialog 的退场拆挂走 `useAnimationsFinished`，它拿「getAnimations 不是函数」
     *   当作 jsdom 的快进判据（`useAnimationsFinished.mjs:74`），补了实现就会去等永不结束的
     *   动画，浮层关掉后内容仍留在文档里。库为这种情况留了全局开关 BASE_UI_ANIMATIONS_DISABLED。
     */
    Object.defineProperty(Element.prototype, "getAnimations", {
        configurable: true,
        value: () => [],
        writable: true,
    })
    Object.defineProperty(globalThis, "BASE_UI_ANIMATIONS_DISABLED", {
        configurable: true,
        value: true,
        writable: true,
    })
    /**
     * input-otp 挂载后会周期性调 `document.elementFromPoint` 探测密码管理器徽章是否遮住了
     * 输入框（避让策略），jsdom 不实现 → 定时器回调里抛未捕获 TypeError。
     * 返回 null 即「探测不到任何元素」，避让不生效，与无徽章的浏览器表现一致。
     */
    Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: vi.fn<() => Element | null>(() => null),
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
