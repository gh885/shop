import { defineConfig } from "@playwright/test"
import { apps, localOrigin } from "../perf/scenarios.mjs"
import { API_URL } from "./fixtures/env"

localOrigin(API_URL)

/**
 * CI 里 preview 服务由 workflow 的「拉起三端 preview（不等待）」步骤持有，这里只连不管；本地裸跑 `pnpm perf:run` 仍由 Playwright 拉起并回收（`reuseExistingServer` 决定归属）。
 * CI 不能把它交给 Playwright 收尾：webServer 的 teardown 不可中断——`gracefullyClose()` 发 SIGKILL 后 `await` 子进程 stdio 的 **EOF**、全程无超时。本仓库 preview 是 `pnpm --filter X exec vp preview` 这条链，只要有一个后代没被 group kill 带走且仍握着继承的 stdout 管道，EOF 永不到来、`playwright test` 永不返回。
 * `reuseExistingServer`：CI 复用（true）、本地自建自收（false + `--strictPort`）。本地不复用是刻意的——复用会让上次残留的 preview 拿旧 dist 冒充本轮产物，性能数字就假了。
 */
const reuseExistingServer = Boolean(process.env.CI)

export default defineConfig({
    testDir: "./performance",
    globalSetup: "./performance/setup.ts",
    timeout: 600_000,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    reporter: "line",
    outputDir: "../.artifacts/perf/playwright",
    projects: apps.map((app: { name: string }) => ({ name: app.name })),
    webServer: apps.map((app: { name: string; port: number }) => ({
        command:
            "pnpm --filter " + app.name + " exec vp preview --port " + app.port + " --strictPort",
        url: "http://localhost:" + app.port + (app.name === "web" ? "/welcome" : "/login"),
        reuseExistingServer,
        timeout: 60_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
    })),
})
