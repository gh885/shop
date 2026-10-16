import { defineConfig, devices } from "@playwright/test"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const apps = [
    { name: "web", port: 4310 },
    { name: "seller", port: 4311 },
    { name: "admin", port: 4312 },
] as const

/** 不复用业务 E2E 的造数/登录 setup：本套不需要后端或数据库，绝不创建真实账号。 */
export default defineConfig({
    testDir: "./i18n",
    outputDir: "./test-results/i18n",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    workers: 1,
    reporter: [["list"]],
    use: {
        ...devices["Desktop Chrome"],
        locale: "en-US",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: apps.map(({ name, port }) => ({
        command:
            "node ../../node_modules/vite-plus/bin/vp build && node ../../node_modules/vite-plus/bin/vp preview --host 127.0.0.1 --port " +
            port +
            " --strictPort",
        cwd: resolve(root, "apps", name),
        url: "http://127.0.0.1:" + port + (name === "web" ? "/welcome" : "/login"),
        // 生产构建里 env.ts 对这三个值走严格 `z.url().parse`（缺即抛，故意的 fail-fast）。
        // web 的 SSR server 在加载阶段就跑它，缺 env 直接起不来（i18n 之前红就是这条）。
        // 本套不连数据面，用各自 preview 的 loopback origin 占位，只为让 server 起得来。
        env: {
            VITE_BACKEND_URL: "http://127.0.0.1:8080",
            VITE_SITE_ORIGIN: "http://127.0.0.1:4310",
            VITE_SELLER_URL: "http://127.0.0.1:4311",
        },
        reuseExistingServer: false,
        timeout: 120_000,
    })),
})
