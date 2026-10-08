import { test, expect, type Page } from "@playwright/test"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const WEB = "http://127.0.0.1:4310"
const apps = [
    {
        name: "web",
        origin: WEB,
        path: "/en-US/welcome",
        title: "Shop - Multi-store E-commerce Platform",
    },
    { name: "seller", origin: "http://127.0.0.1:4311", path: "/login", title: "Seller - Shop" },
    { name: "admin", origin: "http://127.0.0.1:4312", path: "/login", title: "Admin - Shop" },
] as const

/** 只替换业务 HTTP，不碰 DOM、i18next 或 Router；不创建账号、不写数据库。 */
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
                detail: "浏览器语言验收的业务接口替身",
            }),
        })
    })
}

for (const app of apps) {
    test(app.name + ": 初始语言、表单保留、请求头与刷新偏好", async ({ page }, testInfo) => {
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        page.on("console", (message) => {
            if (/hydration|hydrating|didn't match|server rendered HTML/i.test(message.text()))
                errors.push(message.text())
        })
        await mockAnonymousApi(page)
        const initialRefresh = page.waitForRequest((request) =>
            new URL(request.url()).pathname.endsWith("/auth/refresh"),
        )
        const response = await page.goto(app.origin + app.path)
        const firstRefresh = await initialRefresh
        expect(await firstRefresh.headerValue("x-locale")).toBe("en-US")
        expect(response?.status()).toBe(200)
        await expect(page.locator("html")).toHaveAttribute("lang", "en-US")
        await expect(page).toHaveTitle(app.title)
        await expect(page.locator("head > title")).toHaveCount(1)
        await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue(
            "en-US",
        )

        if (app.name === "web")
            await page.getByRole("button", { name: "Sign in", exact: true }).click()
        if (app.name !== "admin")
            await page.getByRole("tab", { name: "Password", exact: true }).click()
        const account =
            app.name === "admin"
                ? page.getByLabel("Employee No.", { exact: true })
                : page.locator("#login-phone")
        const password = page.getByLabel("Password", { exact: true })
        const input = app.name === "admin" ? "i18n-probe" : "13800138000"
        await account.fill(input)
        await password.fill("NotARealAccount123")
        await page
            .getByRole("combobox", { name: "Language", exact: true })
            .selectOption("zh-Hans-CN")
        await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-CN")
        // 定位器改用稳定输入 id/name，避免把语言变化误判为表单丢失。
        await expect(
            app.name === "admin"
                ? page.locator('input[autocomplete="username"]')
                : page.locator("#login-phone"),
        ).toHaveValue(input)
        await expect(page.locator('input[type="password"]')).toHaveValue("NotARealAccount123")
        const sent = page.waitForRequest(
            (request) =>
                request.method() === "POST" &&
                new URL(request.url()).pathname ===
                    (app.name === "admin" ? "/admin/auth/login" : "/auth/login/password"),
        )
        await page.getByRole("button", { name: "登录", exact: true }).click()
        const loginRequest = await sent
        expect(await loginRequest.headerValue("accept-language")).toBe("zh-Hans-CN")
        expect(await loginRequest.headerValue("x-locale")).toBe("zh-Hans-CN")
        const reloadedRefresh = page.waitForRequest((request) =>
            new URL(request.url()).pathname.endsWith("/auth/refresh"),
        )
        await page.reload()
        const refreshAfterReload = await reloadedRefresh
        expect(await refreshAfterReload.headerValue("x-locale")).toBe("zh-Hans-CN")
        await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-CN")
        await expect(page.getByRole("combobox", { name: "语言", exact: true })).toHaveValue(
            "zh-Hans-CN",
        )
        await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en-US")
        await expect(page).toHaveTitle(app.title)
        if (app.name === "web") {
            await page.setViewportSize({ width: 360, height: 800 })
            const control = page.getByRole("combobox", { name: "Language", exact: true })
            await expect(control).toBeVisible()
            const bounds = await control.boundingBox()
            expect(bounds).not.toBeNull()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360)
            await page.screenshot({ path: testInfo.outputPath("language-mobile.png") })
        }
        expect(errors).toEqual([])
        await page.goto("about:blank")
        await page.context().unrouteAll({ behavior: "wait" })
    })
}

test("SSR 经 HTTP 入口按请求隔离，禁用共享文档缓存且不发布单语言 HTML", async ({ request }) => {
    await Promise.all(
        ["/welcome", "/sell"].map(async (path) => {
            expect(
                existsSync(
                    resolve(
                        import.meta.dirname,
                        "../../apps/web/dist/client",
                        path.slice(1),
                        "index.html",
                    ),
                ),
            ).toBe(false)
            const cases = [
                {
                    url: "/en-us" + path,
                    header: "zh-Hans-CN",
                    cookie: "locale=zh-Hans-CN",
                    expected: "en-US",
                },
                {
                    url: "/zh-Hans-CN" + path,
                    header: "en-US",
                    cookie: "locale=en-US",
                    expected: "zh-Hans-CN",
                },
                { url: path, header: "en-US", cookie: "locale=zh-Hans-CN", expected: "zh-Hans-CN" },
                { url: path, header: "zh-Hans-CN", cookie: "locale=en-US", expected: "en-US" },
            ] as const
            await Promise.all(
                cases.map(async ({ url, header, cookie, expected }) => {
                    const response = await request.get(WEB + url, {
                        headers: { "Accept-Language": header, Cookie: cookie },
                    })
                    expect(response.status()).toBe(200)
                    expect(response.url()).toBe(WEB + "/" + expected + path)
                    expect(await response.text()).toContain('lang="' + expected + '"')
                    expect(response.headers()["cache-control"]).toBe("private, no-store")
                    const vary = response
                        .headers()
                        .vary?.toLowerCase()
                        .split(",")
                        .map((part) => part.trim())
                    expect(vary).toEqual(expect.arrayContaining(["accept-language", "cookie"]))
                }),
            )
            const legacy = await request.get(WEB + path + "/index.html", {
                headers: { "Accept-Language": "en-US" },
            })
            expect(legacy.status()).not.toBe(200)
            const unsupported = await request.get(WEB + "/fr-FR" + path, {
                headers: { Accept: "text/html" },
            })
            expect(unsupported.status()).toBe(404)
        }),
    )
})

test("买家端软导航、返回与刷新保留语言和页面标题", async ({ page }) => {
    await mockAnonymousApi(page)
    const documents: string[] = []
    page.on("request", (request) => {
        if (request.resourceType() === "document") documents.push(request.url())
    })
    await page.goto(WEB + "/en-US/welcome")
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("zh-Hans-CN")
    await page.getByRole("link", { name: "免费开店", exact: true }).first().click()
    await expect(page).toHaveURL(WEB + "/zh-Hans-CN/sell")
    expect(documents).toHaveLength(1)
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-CN")
    await page.getByRole("combobox", { name: "语言", exact: true }).selectOption("en-US")
    await expect(page).toHaveTitle("Open a Store for Free - Shop")
    await expect(page.locator("head > title")).toHaveCount(1)
    await page.reload()
    await expect(page).toHaveTitle("Open a Store for Free - Shop")
    await page.goBack()
    await expect(page).toHaveURL(WEB + "/zh-Hans-CN/welcome")
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans-CN")
    await expect(page).toHaveTitle("Shop - 多店铺电商平台")
    const cookies = await page.context().cookies()
    expect(cookies.find((cookie) => cookie.name === "locale")?.value).toBe("en-US")
    await page.goto("about:blank")
    await page.context().unrouteAll({ behavior: "wait" })
})
