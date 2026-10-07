import { defineConfig } from "@playwright/test"
import { apps, localOrigin } from "../perf/scenarios.mjs"
import { API_URL } from "./fixtures/env"

localOrigin(API_URL)

/**
 * CI 里 preview 服务由 workflow 的「拉起三端 preview（不等待）」步骤持有，这里只连不管；
 * 本地裸跑 `pnpm perf:run` 时仍由 Playwright 拉起并回收。
 *
 * 为什么 CI 不能把它交给 Playwright 收尾：Playwright 的 webServer 收尾不可中断。
 * `teardown()` → `gracefullyClose()` 先对自己那个进程组发 SIGKILL，然后 `await waitForCleanup`
 * 等的是子进程 stdio 的 **EOF**（playwright-core/lib/coreBundle.js 的 `launchProcess`），
 * 全程没有超时。本仓库的 preview 命令是 `pnpm --filter X exec vp preview`，这条链上只要有一个
 * 后代没被那次 group kill 带走、且仍握着继承来的 stdout 管道，写端就不关、EOF 永远不来，
 * `playwright test` 就永远不返回：实测挂了 9 分多钟直到 step 限时，`3 passed` 汇总行始终没打印
 * （该汇总在整条 teardown 链跑完之后才输出），job 收尾时三棵 preview 进程树都还活着。
 *
 * 收尾链里除了它没有第二个会阻塞的任务：`createPhasesTask` / `createRunTestsTask` 根本没有
 * teardown，`createReportBeginTask` 的 teardown 是空函数，`createGlobalSetupTask` 只在
 * globalSetup 返回函数时才做事（e2e/performance/setup.ts 返回 void）。
 *
 * 代价是 CI 与本地对 preview 的归属不同：CI 复用（`reuseExistingServer:true`），本地自建自收
 * （`false`，且 Vite 侧 `--strictPort`）。本地保持自建是刻意的——复用会让上一次残留的 preview
 * 拿旧 dist 冒充本轮产物，性能数字就假了。
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
