import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import {
    checkRouting,
    extractCorsOrigins,
    extractNginxServers,
    extractViteProxyArray,
    extractViteSharedPaths,
    loadAndCheck,
    prefixesFromLocationPath,
} from "./routing-drift.mjs"

const sorted = (set) => [...set].toSorted((a, b) => a.localeCompare(b))

describe("prefixesFromLocationPath", () => {
    it("展开 nginx 备选组 location", () => {
        expect(prefixesFromLocationPath("~ ^/(auth|api|reviews)(/|$)")).toEqual([
            "/auth",
            "/api",
            "/reviews",
        ])
    })
    it("剥掉 ^~ modifier，保留纯前缀原样（含尾斜杠）", () => {
        expect(prefixesFromLocationPath("^~ /coupons/")).toEqual(["/coupons/"])
        expect(prefixesFromLocationPath("^~ /admin")).toEqual(["/admin"])
    })
})

describe("extractNginxServers（真实 shop.conf）", () => {
    const srv = extractNginxServers(
        readFileSync(new URL("../deploy/host/nginx/shop.conf", import.meta.url), "utf8"),
    )
    it("web(443) 按 proxy_pass 目标分成 static 与 shared", () => {
        expect(sorted(srv["443"].static)).toEqual([
            "/api",
            "/auth",
            "/coupons/",
            "/favorites",
            "/payments",
            "/reviews",
            "/user",
        ])
        expect(sorted(srv["443"].shared)).toEqual(["/cart", "/orders"])
    })
    it("seller(8443) 与 admin(9443) 各自的前缀", () => {
        expect(sorted(srv["8443"].static)).toEqual(["/api", "/auth", "/seller", "/shops"])
        expect(sorted(srv["9443"].static)).toEqual(["/admin"])
    })
})

describe("extractViteProxyArray", () => {
    it("抓 proxy 数组里的路径字符串", () => {
        expect(sorted(extractViteProxyArray(`proxy: ["/auth", "/api", "/user"],`))).toEqual([
            "/api",
            "/auth",
            "/user",
        ])
    })
})

describe("extractViteSharedPaths", () => {
    it("抓 pageApiProxy 里的 sharedPath 数组", () => {
        expect(
            sorted(extractViteSharedPaths(`const sharedPath = ["/orders", "/cart"].some(`)),
        ).toEqual(["/cart", "/orders"])
    })
})

describe("extractCorsOrigins", () => {
    it("拆逗号分隔的来源字符串", () => {
        expect(sorted(extractCorsOrigins(`cors-allowed-origins: "http://a:1,http://b:2"`))).toEqual(
            ["http://a:1", "http://b:2"],
        )
    })
})

const base = () => ({
    apps: { web: { listen: 443, static: ["/auth"], shared: ["/orders"] } },
    corsDev: ["http://localhost:3000"],
    nginxServers: { 443: { static: new Set(["/auth"]), shared: new Set(["/orders"]) } },
    viteProxies: { web: new Set(["/auth"]) },
    viteShared: { web: new Set(["/orders"]) },
    corsActual: new Set(["http://localhost:3000"]),
})

describe("checkRouting", () => {
    it("全部对齐时无问题", () => {
        expect(checkRouting(base())).toEqual([])
    })

    it("nginx 少一个前缀会被抓出", () => {
        const input = base()
        input.nginxServers["443"].static = new Set()
        const problems = checkRouting(input)
        expect(problems.some((p) => p.includes("web/nginx static") && p.includes("缺 /auth"))).toBe(
            true,
        )
    })

    it("vite proxy 多一个前缀会被抓出", () => {
        const input = base()
        input.viteProxies.web = new Set(["/auth", "/extra"])
        const problems = checkRouting(input)
        expect(problems.some((p) => p.includes("web/vite proxy") && p.includes("多 /extra"))).toBe(
            true,
        )
    })

    it("CORS 白名单不符会被抓出", () => {
        const input = base()
        input.corsActual = new Set(["http://localhost:9999"])
        const problems = checkRouting(input)
        expect(problems.some((p) => p.includes("cors devOrigins"))).toBe(true)
    })
})

describe("loadAndCheck（现状仓库应零漂移）", () => {
    it("nginx / vite / application.yml 三处与 routing.yaml 一致", () => {
        expect(loadAndCheck()).toEqual([])
    })
})
