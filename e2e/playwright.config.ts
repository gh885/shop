import { defineConfig, devices } from "@playwright/test"

import { WEB_URL } from "./fixtures/env"

export default defineConfig({
    testDir: "./tests",
    outputDir: "./test-results",
    /* 每轮先由 globalSetup 现注册一套账号/店铺/商品/订单，测试之间共享这一份，不并发写 */
    globalSetup: "./globalSetup.ts",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    // outputFolder 相对本配置目录，必须与 CI artifact / .gitignore 的 e2e/playwright-report 一致。
    reporter: process.env.CI
        ? [["line"], ["html", { open: "never", outputFolder: "./playwright-report" }]]
        : [["list"]],
    use: {
        baseURL: WEB_URL,
        /* 登录 setup 用全新 context、无 locale cookie：首屏语言跟 Accept-Language 走（SSR 按请求解析）。
           Playwright 默认 en-US 会让首屏渲染英文，ui-auth 的中文精确定位（「登录」）当场失配、红在登录那一步。
           钉成 zh-CN，与文案定位器和 storageState 里既有的 locale=zh-CN cookie 对齐。 */
        locale: "zh-CN",
        /* 失败时留下能定位现场的三件套：trace 看操作序列，video 看当时渲染 */
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "auth",
            testMatch: /auth\.setup\.ts/,
            /* /auth\.setup\.ts/ 同时命中 seller-auth.setup.ts，得点名排除 */
            testIgnore: /seller-auth\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "seller-auth",
            testMatch: /seller-auth\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "chromium",
            dependencies: ["auth"],
            testMatch: /order\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/playwright/.auth/buyer.json",
            },
        },
        {
            name: "seller",
            dependencies: ["seller-auth"],
            testMatch: /seller-smoke\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: process.env.E2E_SELLER_URL
                    ? "e2e/playwright/.auth/seller.json"
                    : undefined,
            },
        },
        {
            name: "cross-role",
            /* 买卖双方各自现登录（spec 内开两个 context），所以不挂任何 storageState */
            testMatch: /logistics\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
    ],
})
