import { beforeAll } from "vitest"
import { client } from "@shop/api"
import { configureSdkClient } from "@shop/common"

import { setupTests } from "@shop/test-utils"

/**
 * 测试期 SDK 装配 —— 与线上同一套拦截器（错误归一化为 ApiError、401 refresh、X-Shop-Id 上下文头）。
 *
 * baseUrl 必须绝对：线上浏览器走同源相对路径（`""`），而 jsdom 的 `new Request()` 来自 undici，
 * 相对 URL 直接抛错 → 所有请求变成「网络错误」。这里用生成物自带的 http://localhost:8080
 * （MSW 的 handler path 通配形式正是按它写的）。
 *
 * 两道保险，缺一不可：
 * 1. 模块级 `configureSdkClient`：装上拦截器（不装则非 2xx 走 ky 自己的抛错路径、读不到 ApiError）；
 * 2. `beforeAll` 再压一次 baseUrl：测试文件 import 业务域时会连带 import `#/shared/lib/api`，
 *    那份装配按浏览器语义把 baseUrl 覆盖成 `""`（线上同源，jsdom 里必炸）。
 *    beforeAll 在所有测试模块 import 之后才跑，所以这一压是有效的。
 */
configureSdkClient("http://localhost:8080")

setupTests()

beforeAll(() => {
    client.setConfig({ baseUrl: "http://localhost:8080" })
})
