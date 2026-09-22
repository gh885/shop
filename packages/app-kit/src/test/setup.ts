import { beforeAll } from "vitest"
import { client } from "@shop/api"
import { configureSdkClient } from "@shop/common"

import { setupTests } from "@shop/test-utils"

/**
 * 三端共享的测试 setup（各 app 的 vitest.config 指到这里：`setupFiles: ["@shop/app-kit/test/setup"]`）。
 *
 * 测试期 SDK 装配 —— 与线上同一套拦截器（错误归一化为 ApiError、401 refresh、x-request-id）。
 * 不装拦截器时非 2xx 走 ky 自己的抛错路径（会预读 body），hey-api 解析时报
 * "Body is unusable"，错误形状与线上不一致 —— 于是「404 = 从没申请过售后」这类
 * 按 status 分支的逻辑在测试里根本测不到。
 *
 * baseUrl 必须绝对：线上浏览器走同源相对路径（`""`），而 jsdom 的 `new Request()` 来自 undici，
 * 相对 URL 直接抛错 → 所有请求变成「网络错误」。这里用生成物自带的 http://localhost:8080
 * （MSW 的 handler path 通配形式正是按它写的）。
 *
 * 两道保险，缺一不可：
 * 1. 模块级 `configureSdkClient`：装上拦截器；
 * 2. `beforeAll` 再压一次 baseUrl：测试文件 import 业务域时会连带 import 各端的 api 装配模块，
 *    那份装配按浏览器语义把 baseUrl 覆盖成 `""`（线上同源，jsdom 里必炸）。
 *    beforeAll 在所有测试模块 import 之后才跑，所以这一压是有效的。
 */
configureSdkClient("http://localhost:8080")

setupTests()

beforeAll(() => {
    client.setConfig({ baseUrl: "http://localhost:8080" })
})
