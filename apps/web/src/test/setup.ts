import { beforeAll } from "vitest"
import { client } from "@shop/api"
import { configureSdkClient } from "@shop/common"

import { setupTests } from "@shop/test-utils"

/**
 * 测试期 SDK 装配 —— 与线上同一套拦截器（错误归一化为 ApiError、401 refresh、correlation id）。
 *
 * 两个必须写死的点：
 * 1. **绝对 baseUrl**：线上浏览器走同源相对路径（`""`），而 jsdom 的 `new Request()` 来自
 *    undici，相对 URL 直接抛错 → 所有请求变成「网络错误」。测试里用生成物自带的
 *    `http://localhost:8080`（MSW 的 handler path 通配形式正是按它写的）。
 * 2. **必须装配**：不装拦截器时非 2xx 走 ky 自己的抛错路径（会预读 body），
 *    hey-api 解析时报 "Body is unusable"，错误形状与线上不一致 ——
 *    于是「404 = 从没申请过售后」这类按 status 分支的逻辑在测试里根本测不到。
 *
 * 另外 `beforeAll` 会把 baseUrl 再压一次：测试文件 import 业务域时会连带 import
 * `#/shared/api/client`，那份装配按浏览器语义覆盖成 `""`（线上同源，jsdom 里必炸）。
 * beforeAll 在所有测试模块 import 之后才跑，所以这一压是有效的。
 */
configureSdkClient("http://localhost:8080")

setupTests()

beforeAll(() => {
    client.setConfig({ baseUrl: "http://localhost:8080" })
})
