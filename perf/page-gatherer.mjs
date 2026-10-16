import { lighthousePath } from "./runtime.mjs"
import { getScenario, localOrigin, refreshCookie } from "./scenarios.mjs"
const { default: BaseGatherer } = await import(lighthousePath("core/gather/base-gatherer.js"))

export default class ShopPageGatherer extends BaseGatherer {
    meta = { supportedModes: ["navigation"] }

    async startInstrumentation(context) {
        const app = getScenario()
        const origin = localOrigin(app.origin)
        await context.driver.defaultSession.sendCommand("Network.setCookie", {
            name: "locale",
            value: "zh-CN",
            url: origin,
            path: "/",
        })
        if (!app.auth) return
        const backend = localOrigin(process.env.E2E_API_URL || "http://localhost:8080")
        const password = process.env.PERF_PASSWORD
        const account = process.env.PERF_ACCOUNT
        if (!password || !account) throw new Error("Missing local fixture credentials")
        const response = await fetch(backend + app.auth.login, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                [app.name === "admin" ? "employeeNo" : "phone"]: account,
                password,
                deviceId: "perf-lab",
            }),
        })
        const value = refreshCookie(response, app.auth)
        // 每轮重登，不依赖上一轮被轮换的 refresh cookie；token 不写进 artifacts 或日志。
        await context.driver.defaultSession.sendCommand("Network.setCookie", {
            name: app.auth.cookie,
            value,
            url: origin,
            path: app.auth.cookiePath,
            httpOnly: true,
            secure: false,
        })
    }

    async getArtifact(context) {
        const app = getScenario()
        const path = new URL(context.baseArtifacts.URL.requestedUrl).pathname
        const page = app.pages.find((item) => item.path === path)
        if (!page) throw new Error("Unexpected measured page")
        return context.driver.executionContext.evaluate(
            (selectors, text) => ({
                origin: location.origin,
                path: location.pathname,
                visible: selectors.every((selector) =>
                    [...document.querySelectorAll(selector)].some(
                        (element) => element.getClientRects().length > 0,
                    ),
                ),
                hasText: !text || document.body.innerText.includes(text),
                loading: Boolean(
                    document.querySelector('main [data-slot="skeleton"], main [aria-busy="true"]'),
                ),
            }),
            { args: [page.selectors, page.text || ""], useIsolation: true },
        )
    }
}
