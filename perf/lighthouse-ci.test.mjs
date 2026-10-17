import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import ShopPageGatherer from "./page-gatherer.mjs"
import lighthouserc from "./lighthouserc.cjs"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
    apps,
    getScenario,
    measurementIsValid,
    localOrigin,
    pageIsReady,
    refreshCookie,
} from "./scenarios.mjs"

const root = resolve(import.meta.dirname, "..")
const cli = fileURLToPath(new URL("src/cli.js", import.meta.resolve("@lhci/cli/package.json")))
const directories = []
afterEach(() => {
    vi.unstubAllEnvs()
    for (const directory of directories.splice(0)) {
        if (
            dirname(directory) !== resolve(tmpdir()) ||
            !directory.startsWith(join(resolve(tmpdir()), "shop-lhci-"))
        )
            throw new Error("Unsafe test cleanup path")
        rmSync(directory, { recursive: true, force: true })
    }
})

function assertRuns(overrides = [], format = "cjs") {
    const cwd = mkdtempSync(join(resolve(tmpdir()), "shop-lhci-"))
    directories.push(cwd)
    mkdirSync(join(cwd, ".lighthouseci"))
    for (let index = 0; index < 3; index++) {
        const audits = {
            "shop-page-ready": { score: 1, scoreDisplayMode: "binary" },
            "http-status-code": { score: 1, scoreDisplayMode: "binary" },
            "largest-contentful-paint": { score: 1, numericValue: 1000 },
            "cumulative-layout-shift": { score: 1, numericValue: 0 },
            "total-blocking-time": { score: 1, numericValue: 0 },
            ...overrides[index],
        }
        writeFileSync(
            join(cwd, ".lighthouseci", "lhr-" + index + ".json"),
            JSON.stringify({
                requestedUrl: "http://localhost:4173/",
                finalUrl: "http://localhost:4173/",
                fetchTime: new Date(index).toISOString(),
                audits,
                categories: { performance: { score: 1 } },
            }),
        )
    }
    const configPath =
        format === "yaml" ? join(cwd, "lighthouserc.yml") : join(root, "perf/lighthouserc.cjs")
    if (format === "yaml")
        writeFileSync(
            configPath,
            "ci:\n  assert:\n    assertions:\n      shop-page-ready: [error, {minScore: 1}]\n",
        )
    return spawnSync(process.execPath, [cli, "assert", "--config=" + configPath], {
        cwd,
        encoding: "utf8",
        timeout: 15_000,
    })
}

describe("Lighthouse CI gates", () => {
    it("retains LHCI YAML API support after excluding the unused YAML CLI parser", () => {
        expect(assertRuns([], "yaml").status).toBe(0)
    })
    it("accepts all valid samples", () => {
        expect(assertRuns().status).toBe(0)
    })
    it("one invalid sample fails even if the median sample is valid", () => {
        expect(
            assertRuns([{ "shop-page-ready": { score: 0, scoreDisplayMode: "binary" } }]).status,
        ).toBe(1)
    })
    it("a gatherer error cannot pass as a missing score", () => {
        expect(
            assertRuns([
                {
                    "shop-page-ready": {
                        score: null,
                        scoreDisplayMode: "error",
                        errorMessage: "Fixture unavailable",
                    },
                },
            ]).status,
        ).toBe(1)
    })
    it("a failed document status blocks the run", () => {
        expect(
            assertRuns([{ "http-status-code": { score: 0, scoreDisplayMode: "binary" } }]).status,
        ).toBe(1)
    })
    it("performance warnings do not turn measurement noise into a hard failure", () => {
        expect(
            assertRuns(
                Array.from({ length: 3 }, () => ({
                    "largest-contentful-paint": { score: 0, numericValue: 6000 },
                })),
            ).status,
        ).toBe(0)
    })
    it("keeps credentials out of the scenario config", () => {
        // 字段名可以叫 password（登录接口就是这么叫的），值只能是占位符或非敏感字面量。
        // 改成解析而不是 grep 字符串：`grep '"password"'` 在加 auth.body 之后会把字段名当成泄漏。
        const config = JSON.parse(readFileSync(join(root, "perf/pages.json"), "utf8"))
        const placeholder = /^\{(account|password)\}$/
        const literals = new Set(["perf-lab"])
        for (const app of config.apps) {
            for (const value of Object.values(app.auth?.body ?? {})) {
                expect(placeholder.test(value) || literals.has(value)).toBe(true)
            }
        }
        expect(apps.flatMap((app) => app.pages)).toHaveLength(7)
    })
    it("launches Chrome as sandbox-less as the Playwright suite does", () => {
        // 性能 job 与业务 E2E 共用 Playwright 那份 Chromium，但 LHCI 走 chrome-launcher 自己拉起它，
        // 不带 playwright-core 默认就有的 --no-sandbox。少了它，ubuntu-latest 上 Chromium 直接
        // FATAL "No usable sandbox!" 自杀，而 LHCI 只报 "Unable to connect to Chrome"——三个端全红、
        // 却完全看不出跟沙箱有关。这个参数是字符串（LHCI 侧做 `chromeFlags || ''` 再拼 --headless=new）。
        const flags = lighthouserc.ci.collect.settings.chromeFlags
        expect(typeof flags).toBe("string")
        expect(flags.split(/\s+/)).toContain("--no-sandbox")
    })
    it("in CI reuses the preview servers the workflow starts instead of owning them", async () => {
        // Playwright 的 webServer 收尾不可中断（SIGKILL 完等子进程 stdio 的 EOF，没有超时），
        // 在 CI 上实测把整步挂到限时为止。所以 CI 里必须让它只复用 workflow 起好的 preview：
        // 一旦有人把 reuseExistingServer 改回固定 false，这个 job 会重新变成「静默挂死」。
        // 顺手 stub 掉 E2E_API_URL，免得本机 apps/server/.env 里配了远端数据面时导入即抛。
        vi.stubEnv("CI", "true")
        vi.stubEnv("E2E_API_URL", "http://localhost:8080")
        const module = await import("../e2e/perf.config.ts")
        const config = module.default
        // CI 按端拆到不同 runner，不在同机并发 Chrome，也不减采样数换速度。
        expect(config.workers).toBe(1)
        expect(config.fullyParallel).toBe(false)
        expect(config.retries).toBe(0)
        expect(config.projects.map((project) => project.name)).toEqual(apps.map((app) => app.name))
        expect(lighthouserc.ci.collect.numberOfRuns).toBe(3)
        expect(config.webServer).toHaveLength(3)
        expect(config.webServer.every((server) => server.reuseExistingServer === true)).toBe(true)
    })
    it.each([
        "https://example.com",
        "http://example.com",
        "http://localhost.evil.test",
        "http://user:pass@localhost:8080",
    ])("rejects non-local or credential-bearing origin %s", (origin) => {
        expect(() => localOrigin(origin)).toThrow("only allow local HTTP services")
    })
    it("rejects a missing fixture instead of measuring a substituted URL", () => {
        expect(() => getScenario({ PERF_APP: "web" })).toThrow("Missing fixture")
    })
    it("rejects login, skeleton and API-failure pages", () => {
        const page = { path: "/shops", api: "/admin/shops" }
        const observed = {
            origin: "http://localhost:4000",
            path: "/shops",
            visible: true,
            hasText: true,
            loading: false,
        }
        const records = [
            { url: "http://localhost:4000/admin/shops", statusCode: 200, finished: true },
        ]
        expect(pageIsReady(page, observed, records, "http://localhost:4000")).toBe(true)
        expect(
            pageIsReady(
                page,
                { ...observed, origin: "http://example.com" },
                records,
                "http://localhost:4000",
            ),
        ).toBe(false)
        expect(
            pageIsReady(page, { ...observed, path: "/login" }, records, "http://localhost:4000"),
        ).toBe(false)
        expect(
            pageIsReady(page, { ...observed, loading: true }, records, "http://localhost:4000"),
        ).toBe(false)
        expect(
            pageIsReady(page, { ...observed, visible: false }, records, "http://localhost:4000"),
        ).toBe(false)
        expect(
            pageIsReady(page, { ...observed, hasText: false }, records, "http://localhost:4000"),
        ).toBe(false)
        expect(
            pageIsReady(
                page,
                observed,
                [{ ...records[0], statusCode: 500 }],
                "http://localhost:4000",
            ),
        ).toBe(false)
        expect(pageIsReady(page, observed, [], "http://localhost:4000")).toBe(false)
    })
    it("rejects failed or cookie-less login without reporting response bodies", () => {
        expect(() =>
            refreshCookie({ ok: false, status: 401 }, { cookie: "refresh_token" }),
        ).toThrow("HTTP 401")
        expect(() =>
            refreshCookie(
                { ok: true, headers: { getSetCookie: () => [] } },
                { cookie: "refresh_token" },
            ),
        ).toThrow("expected cookie")
    })
})

describe("Lighthouse per-run authentication", () => {
    it("uses a fresh login and cookie for each measurement round", async () => {
        let logins = 0
        const server = createServer((request, response) => {
            request.resume()
            logins++
            response.setHeader(
                "Set-Cookie",
                "refresh_token=" + randomUUID() + "; Path=/auth/refresh; HttpOnly",
            )
            response.end("{}")
        })
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
        try {
            vi.stubEnv("PERF_APP", "seller")
            vi.stubEnv("PERF_PRODUCT_NAME", "fixture")
            vi.stubEnv("PERF_ORDER_NO", "fixture-order")
            vi.stubEnv("PERF_ACCOUNT", randomUUID())
            vi.stubEnv("PERF_PASSWORD", randomUUID())
            vi.stubEnv("E2E_API_URL", "http://127.0.0.1:" + server.address().port)
            const sendCommand = vi.fn(async () => ({ success: true }))
            const context = { driver: { defaultSession: { sendCommand } } }
            const gatherer = new ShopPageGatherer()
            await gatherer.startInstrumentation(context)
            await gatherer.startInstrumentation(context)
            const cookies = sendCommand.mock.calls
                .filter(([, options]) => options.name === "refresh_token")
                .map(([, options]) => options.value)
            expect(logins).toBe(2)
            expect(cookies).toHaveLength(2)
            expect(cookies[0]).not.toBe(cookies[1])
        } finally {
            server.closeAllConnections()
            await new Promise((resolve) => server.close(resolve))
        }
    })
})

describe("measurement completeness", () => {
    const measured = (value) => ({
        audits: Object.fromEntries(
            ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time"].map(
                (id) => [id, { numericValue: value }],
            ),
        ),
    })
    it("accepts real zero measurements, but rejects runtime errors", () => {
        expect(measurementIsValid(measured(0))).toBe(true)
        expect(measurementIsValid({ ...measured(1), runtimeError: { code: "NO_FCP" } })).toBe(false)
        expect(measurementIsValid({})).toBe(false)
    })
    it.each([null, undefined, Number.NaN, Infinity, -1, "100"])(
        "rejects missing/invalid metric %s",
        (value) => {
            expect(measurementIsValid(measured(value))).toBe(false)
        },
    )
})
