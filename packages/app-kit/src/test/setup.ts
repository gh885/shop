import { beforeAll } from "vite-plus/test"
import { client } from "@shop/api"
import { configureSdkClient } from "@shop/client"
import { setupTests } from "@shop/test-utils"

/**
 * 必须与线上装同一套 SDK 拦截器：不装时非 2xx 走 ky 抛错（会预读 body）→ hey-api 报 "Body is unusable"、错误形状与线上不一致，按 status 分支的逻辑根本测不到。
 * baseUrl 必须绝对，且要两道保险：jsdom 的 new Request 对相对 URL 直接抛错；模块级 configureSdkClient 装拦截器 + beforeAll 再压一次 baseUrl（测试 import 业务域会连带跑各端 api 装配、把它覆盖成 ""，beforeAll 在其后才跑）。
 */
configureSdkClient("http://localhost:8080")

setupTests()

beforeAll(() => {
    client.setConfig({ baseUrl: "http://localhost:8080" })
})
