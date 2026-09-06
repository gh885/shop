import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./msw-server"

/**
 * 测试环境装配：jest-dom 匹配器 + MSW server + RTL 自动清理。
 * 各 app 的 vitest setupFiles 里调用一次（jsdom 环境的 suite）。
 */
export function setupTests() {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
    afterEach(() => {
        server.resetHandlers()
        cleanup()
    })
    afterAll(() => server.close())
}
