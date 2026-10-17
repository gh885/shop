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

// 入口页无障碍门禁：axe 扫 wcag2a/aa/21a/21aa，第一梯队只拦 critical/serious（真正阻断级），moderate/minor 留给后续分层收紧，避免一次把历史存量全判红。与 i18n 验收共用 i18n.config.ts 的 webServer（三端 preview 已在 4310/4311/4312 起好），放进 e2e/i18n/ 就随 `pnpm test:e2e:i18n` 跑、CI 的 frontend-i18n job 自然覆盖。
for (const app of apps) {
    test(`${app.name}: 入口页无障碍（axe critical/serious）`, async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        await mockAnonymousApi(page)
        // 扫描前把动效偏好切成「减弱」，两个原因都不是放水：① 量到的得是终态——登录页入场淡入 700ms，axe 在动画途中量到半透明中间态（白底上那几个浅灰/淡蓝全是这么来的），不切偏好判据就随 runner 负载飘；② 得让全部元素都可见——ui-web 的 prefers-reduced-motion 兜底把 duration/delay 压到 0，带延迟的入场动画（admin 的 stagger）直接落终态，否则它们在延迟窗口停在 opacity:0 被 axe 当不可见跳过，门禁就成「量不到当通过」。走的是 DESIGN.md §2.5 已有契约，不是给某页开特例。
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.goto(app.origin + app.path)
        // 等 SPA 挂载（i18n 会把 lang 写到 <html>），否则 axe 扫到的是空白壳
        await expect(page.locator("html")).toHaveAttribute("lang")

        const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            // 品牌实色底豁免：主色回淘宝原味 #FF5000 后白字实色底 3.28:1 不过 AA——2026-10 显式产品决策（观感对等淘宝）。标记来源两处：ui-web Button 给 primary 实色变体自动打 data-brand-cta、落地页两枚链接式 CTA 手工打；非实色底按钮与其余元素照旧全量拦。
            .exclude("[data-brand-cta]")
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
