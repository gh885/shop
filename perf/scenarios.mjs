import { readFileSync } from "node:fs"

const config = JSON.parse(readFileSync(new URL("./pages.json", import.meta.url), "utf8"))
export const apps = config.apps

export function localOrigin(raw) {
    const url = new URL(raw)
    if (
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password
    ) {
        throw new Error("Lighthouse scenarios only allow local HTTP services")
    }
    return url.origin
}

export function getScenario(env = process.env) {
    const app = apps.find((item) => item.name === env.PERF_APP)
    if (!app) throw new Error("PERF_APP must be web, seller or admin")
    const replacements = {
        productId: env.PERF_PRODUCT_ID,
        productName: env.PERF_PRODUCT_NAME,
        orderNo: env.PERF_ORDER_NO,
        shopName: env.PERF_SHOP_NAME,
    }
    const expand = (value) =>
        value?.replaceAll(/\{(\w+)\}/g, (_, key) => {
            if (!replacements[key]) throw new Error("Missing fixture field: " + key)
            return replacements[key]
        })
    return {
        ...app,
        origin: "http://localhost:" + app.port,
        // web 的 SSR 会把裸路径 307 到 /<locale>/；采集直接命中本地化路径，
        // 让 URL、gatherer 找页、pageIsReady 的 observed.path 全对齐同一个串。
        pages: app.pages.map((page) => ({
            ...page,
            path: app.locale
                ? "/" + app.locale + "/" + expand(page.path).replace(/^\/+/, "")
                : expand(page.path),
            text: expand(page.text),
            query: new URLSearchParams(
                Object.entries(page.query || {}).map(([key, value]) => [key, expand(value)]),
            ).toString(),
        })),
    }
}

export function pageIsReady(page, observed, records, origin) {
    return (
        observed.origin === origin &&
        observed.path === page.path &&
        observed.visible &&
        observed.hasText &&
        !observed.loading &&
        (!page.api ||
            records.some(
                (record) =>
                    new URL(record.url).origin === origin &&
                    new URL(record.url).pathname === page.api &&
                    record.statusCode >= 200 &&
                    record.statusCode < 300 &&
                    record.finished,
            ))
    )
}

export function refreshCookie(response, auth) {
    if (!response.ok) throw new Error("Fixture login failed: HTTP " + response.status)
    const line = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(auth.cookie + "="))
    if (!line) throw new Error("Fixture login did not issue the expected cookie")
    return line.slice(auth.cookie.length + 1).split(";")[0]
}

/**
 * 登录请求体由 `pages.json` 的 `auth.body` 描述：字段名各端不同（卖家 `phone`、平台 `employeeNo`），
 * 写进数据、这里只做模板展开——加第四端就不用改 gatherer 里的三元判断。
 * 口令永远只从环境变量来，不进配置文件。
 */
export function loginBody(auth, env = process.env) {
    const values = { account: env.PERF_ACCOUNT, password: env.PERF_PASSWORD }
    return Object.fromEntries(
        Object.entries(auth.body).map(([field, template]) => [
            field,
            template.replaceAll(/\{(\w+)\}/g, (_, key) => {
                if (!values[key]) throw new Error("Missing local fixture credentials: " + key)
                return values[key]
            }),
        ]),
    )
}

// 慢只警告；没有有效测量值必须失败，不能让空值绕过数值阈值。
export function measurementIsValid(report) {
    return (
        report !== null &&
        typeof report === "object" &&
        !report.runtimeError &&
        ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time"].every(
            (id) => {
                const audit = report.audits?.[id]
                return (
                    audit?.scoreDisplayMode !== "error" &&
                    Number.isFinite(audit?.numericValue) &&
                    audit.numericValue >= 0
                )
            },
        )
    )
}
