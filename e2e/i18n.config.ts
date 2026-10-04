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
        reuseExistingServer: false,
        timeout: 120_000,
    })),
})
