// oxlint-disable-next-line import/no-unassigned-import -- jest-dom 匹配器注册副作用
import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, vi } from "vite-plus/test"

import { server } from "./msw-server"

/** jsdom 缺这些浏览器观察 API，这里只补平台能力、不伪造业务模块；要观察器实例行为的用例可在自己 beforeEach 覆盖全局实现。 */
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
     * Base UI 两条 WAAPI 需求在 jsdom 里互冲、必须成对给：ScrollArea 视口无条件调 getAnimations → 补返回空数组；
     * 但 Popup/Dialog 退场把「getAnimations 非函数」当 jsdom 快进判据（useAnimationsFinished.mjs:74），补了实现会等永不结束的动画 → 用全局开关 BASE_UI_ANIMATIONS_DISABLED 关掉。
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
     * input-otp 挂载后周期调 document.elementFromPoint 探测密码管理器徽章是否遮住输入框（避让），jsdom 不实现会在定时器回调抛 TypeError。
     * 返回 null 即「探测不到任何元素」、避让不生效，与无徽章的浏览器表现一致。
     */
    Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: vi.fn<() => Element | null>(() => null),
        writable: true,
    })
}

/** 测试环境装配（jest-dom 匹配器 + MSW server + RTL 自动清理）：各 app 的 setupFiles 里调用一次（jsdom 环境的 suite）。 */
export function setupTests() {
    /**
     * findBy/waitFor 默认只等 1000ms，全量跑是 117 个文件各起 worker 抢 CPU：满载时「粘贴→区划库反查→地区路径回填」这条链跑不完 1s，于是 AddressFormDialog 一类只在并行红、单跑必绿。
     * waitFor 命中即返回，放大预算只拖慢真失败、不拖慢通过的用例。
     */
    configure({ asyncUtilTimeout: 3_000 })
    beforeAll(() => {
        installDomStubs()
        // msw 3 把 onUnhandledRequest 改名为 onUnhandledFrame（覆盖 HTTP 与 WS 两类「网络帧」），'error' 语义不变、旧名已从 listen() 选项类型移除
        server.listen({ onUnhandledFrame: "error" })
    })
    afterEach(() => {
        server.resetHandlers()
        cleanup()
    })
    afterAll(() => server.close())
}
