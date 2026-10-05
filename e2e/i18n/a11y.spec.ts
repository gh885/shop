import { test, expect, type Page } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"

const WEB = "http://127.0.0.1:4310"
const apps = [
    { name: "web", origin: WEB, path: "/welcome" },
    { name: "seller", origin: "http://127.0.0.1:4311", path: "/login" },
    { name: "admin", origin: "http://127.0.0.1:4312", path: "/login" },
] as const

/** 只替换业务 HTTP，不碰 DOM、i18next 或 Router；不创建账号、不写数据库——与 i18n 验收同源。 */
async function mockAnonymousApi(page: Page) {
    await page.context().route("**/api/rum/events", (route) => route.fulfill({ status: 204 }))
    await page.context().route(/\/(?:auth|admin\/auth|user|cart)\//, async (route) => {
        const status = route.request().url().includes("/login") ? 400 : 401
        await route.fulfill({
            status,
            contentType: "application/problem+json",
            body: JSON.stringify({
                type: "about:blank",
                title: status === 400 ? "Bad Request" : "Unauthorized",
                status,
                detail: "a11y 验收的业务接口替身",
            }),
        })
    })
}

// 入口页无障碍门禁：用 axe 扫 wcag2a/aa/21a/21aa 的违规，第一梯队只拦 critical / serious
// （真正的阻断级问题），moderate / minor 留给后续分层收紧，避免一次性把历史存量全判红。
// 与 i18n 验收共用 i18n.config.ts 的 webServer（三端 preview 已在 4310/4311/4312 起好），
// 所以本文件放进 e2e/i18n/ 就随 `pnpm test:e2e:i18n` 一起跑，CI 的 frontend-i18n job 自然覆盖。
for (const app of apps) {
    test(`${app.name}: 入口页无障碍（axe critical/serious）`, async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        await mockAnonymousApi(page)
        await page.goto(app.origin + app.path)
        // 等 SPA 挂载（i18n 会把 lang 写到 <html>），否则 axe 扫到的是空白壳
        await expect(page.locator("html")).toHaveAttribute("lang")

        const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()

        const blocking = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious",
        )
        if (blocking.length > 0) {
            const summary = blocking
                .map((v) => `  [${v.impact}] ${v.id}: ${v.help}（${v.nodes.length} 处）`)
                .join("\n")
            console.log(`[a11y:${app.name}] ${blocking.length} 个阻断级违规:\n${summary}`)
        }

        expect(
            blocking,
            `入口页存在 ${blocking.length} 个 critical/serious 无障碍违规，详见上方日志`,
        ).toEqual([])
        expect(errors).toEqual([])
        await page.goto("about:blank")
        await page.context().unrouteAll({ behavior: "wait" })
    })
}
