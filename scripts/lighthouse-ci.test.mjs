import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import ShopPageGatherer from "../perf/page-gatherer.mjs"
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
} from "../perf/scenarios.mjs"

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
    it("does not store fixture credentials in scenario config", () => {
        const text = readFileSync(join(root, "perf/pages.json"), "utf8")
        expect(text).not.toContain('"password"')
        expect(apps.flatMap((app) => app.pages)).toHaveLength(7)
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
    it.each([null, undefined, NaN, Infinity, -1, "100"])(
        "rejects missing/invalid metric %s",
        (value) => {
            expect(measurementIsValid(measured(value))).toBe(false)
        },
    )
})
