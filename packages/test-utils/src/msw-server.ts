import { setupServer } from "msw/node"

import { defaultHandlers } from "./handlers"

/** 进程级 MSW server（Node 环境，拦截全局 fetch）：由 setupTests() 启停，用例内 server.use() 覆盖/追加（resetHandlers 还原）。 */
export const server = setupServer(...defaultHandlers)
