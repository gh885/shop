import { setupServer } from "msw/node"

import { defaultHandlers } from "./handlers"

/**
 * 进程级 MSW server（Node 环境，拦截全局 fetch）。
 *
 * 各 app 的 vitest setupFiles 调用 setupTests() 启停；单个测试用
 * server.use(http.xxx(...)) 覆盖或追加 handler（仅对该用例生效，resetHandlers 还原）。
 */
export const server = setupServer(...defaultHandlers)
