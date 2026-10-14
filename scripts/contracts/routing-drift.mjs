#!/usr/bin/env node
/**
 * 路由/CORS 漂移门禁（`pnpm routing:drift`，接进 lefthook pre-push）。
 *
 * 抓什么：同一份「哪些路径转后端 / 开发期跨域白名单」被手抄在三处运行时配置里，改一边忘另一边是
 * **静默失配**——部署后该前缀请求 404 或走错上游，编译器与 e2e 都看不见（本地走 Vite proxy 同源，
 * 生产走 nginx，两条路径都通时才没人意识到它们是两份手抄）：
 *   - deploy/host/nginx/shop.conf 的 location 表（生产反代）
 *   - apps/{web,seller,admin}/vite.config.ts 的 proxy 数组（dev 同源代理）
 *   - apps/server/src/main/resources/application.yml 的 cors-allowed-origins（不同源部署形态才生效）
 *
 * 真相源是 contracts/routing.yaml。本脚本把它和三处逐一比对，任一集合对不齐就 exit 1。
 * 走**校验式而非生成式**：那三处都必须各自存在（运行时形态不同），无法由一份 YAML 生成，
 * 只能钉住口径 + 事后核对——与 sdk-drift / errors-drift 同一族。
 *
 * 关联键：routing.yaml 每 app 的 `listen` 端口对应 nginx 里那个 server 块；app 名对应
 * `apps/<name>/vite.config.ts`。nginx 侧只认 proxy_pass 到后端的 location：
 *   http://shop_server → static；http://$shop_shared_upstream → shared（按 Accept 分流）；
 *   其余（shop_web / try_files 静态资源）与路由口径无关，忽略。
 */

import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import { out as makeOut } from "../lib/out.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))
const SOURCES = {
    routing: "contracts/routing.yaml",
    nginx: "deploy/host/nginx/shop.conf",
    webVite: "apps/web/vite.config.ts",
    sellerVite: "apps/seller/vite.config.ts",
    adminVite: "apps/admin/vite.config.ts",
    corsYml: "apps/server/src/main/resources/application.yml",
}

/** 从 `{` 处做花括号配平，返回块内文本（不含首尾括号）。 */
function balancedBraces(text, openIdx) {
    let depth = 0
    for (let i = openIdx; i < text.length; i++) {
        if (text[i] === "{") depth++
        else if (text[i] === "}") {
            depth--
            if (depth === 0) return text.slice(openIdx + 1, i)
        }
    }
    return null
}

/**
 * 把一个 location 路径表达式展开成前缀集合。
 * 处理三种写法：`^/(auth|api|reviews)(/|$)` → 各 alt 加 "/"；`/coupons/` / `/admin` → 原样；
 * 前导 modifier（`~` / `^~` / `=`）先剥掉。
 */
export function prefixesFromLocationPath(expr) {
    const parts = expr.trim().split(/\s+/)
    if (parts.length > 1 && /^[~^*=]+$/.test(parts[0])) parts.shift()
    const path = parts.join("").replace(/^\^/, "")
    // 备选组形式：/(a|b|c)(/|$) —— 只认 `/(group)` 开头并展开 group，忽略尾部的 `(/|$)`。
    // 只有 proxy_pass 到后端的 location 会走到这里，静态资源 location 是纯路径、匹配不上。
    const alt = path.match(/^\/\(([^)]+)\)/)
    if (alt) return alt[1].split("|").map((a) => "/" + a)
    return [path]
}

/** 解析 nginx shop.conf：返回 { "<listen端口>": { static:Set, shared:Set } }。 */
export function extractNginxServers(text) {
    const clean = text
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n")
    const servers = {}
    const re = /\bserver\s*\{/g
    let m
    while ((m = re.exec(clean))) {
        const open = clean.indexOf("{", m.index)
        const body = balancedBraces(clean, open)
        if (body == null) continue
        const listen = body.match(/listen\s+(\d+)\b/)
        if (!listen) continue
        const staticSet = new Set()
        const sharedSet = new Set()
        const locRe = /\blocation\s+([^{]+?)\s*\{/g
        let lm
        while ((lm = locRe.exec(body))) {
            const locOpen = body.indexOf("{", lm.index + lm[0].length - 1)
            const locBody = balancedBraces(body, locOpen)
            if (locBody == null) continue
            const pp = locBody.match(/proxy_pass\s+(\S+);/)
            if (!pp) continue
            const bucket =
                pp[1] === "http://shop_server"
                    ? staticSet
                    : pp[1] === "http://$shop_shared_upstream"
                      ? sharedSet
                      : null
            if (!bucket) continue
            for (const p of prefixesFromLocationPath(lm[1])) bucket.add(p)
        }
        servers[listen[1]] = { static: staticSet, shared: sharedSet }
    }
    return servers
}

/** 解析一份 vite.config.ts 的 `proxy: [...]` 数组，返回其中的路径集合。 */
export function extractViteProxyArray(text) {
    const i = text.indexOf("proxy:")
    if (i < 0) return new Set()
    const open = text.indexOf("[", i)
    const close = text.indexOf("]", open)
    const inner = text.slice(open + 1, close)
    const out = new Set()
    for (const m of inner.matchAll(/["'](\/[^"']*)["']/g)) out.add(m[1])
    return out
}

/** 解析 web 的 pageApiProxy 里 `sharedPath = [...]`（页面/API 共用前缀，不在静态 proxy 数组里）。 */
export function extractViteSharedPaths(text) {
    const m = text.match(/sharedPath\s*=\s*\[([^\]]*)\]/)
    if (!m) return new Set()
    const out = new Set()
    for (const s of m[1].matchAll(/["'](\/[^"']*)["']/g)) out.add(s[1])
    return out
}

/** 解析 application.yml 的 cors-allowed-origins（逗号分隔字符串），返回来源集合。 */
export function extractCorsOrigins(text) {
    const m = text.match(/cors-allowed-origins:\s*"([^"]*)"/)
    if (!m) return new Set()
    return new Set(
        m[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    )
}

/** 集合相等（无序）。 */
function setsEqual(a, b) {
    if (a.size !== b.size) return false
    for (const x of a) if (!b.has(x)) return false
    return true
}

/** 比对一份实际集合与真相源期望，返回人类可读的差异（无差异返回 null）。 */
function diff(label, expected, actual) {
    if (setsEqual(expected, actual)) return null
    const missing = [...expected].filter((x) => !actual.has(x))
    const extra = [...actual].filter((x) => !expected.has(x))
    const bits = []
    if (missing.length > 0) bits.push(`缺 ${missing.join(", ")}`)
    if (extra.length > 0) bits.push(`多 ${extra.join(", ")}`)
    return `${label}：与 routing.yaml 不符（${bits.join("；")}）`
}

/**
 * 核心比对（纯函数，便于单测）。入参均为已解析结构：
 * apps: routing.yaml 的 apps（{ name: { listen, static:[], shared?:[] } }）
 * corsDev: routing.yaml 的 cors.devOrigins 数组
 * nginxServers / viteProxies / viteShared / corsActual: 各源解析出的集合
 */
export function checkRouting({ apps, corsDev, nginxServers, viteProxies, viteShared, corsActual }) {
    const problems = []
    for (const [name, cfg] of Object.entries(apps)) {
        const expectedStatic = new Set(cfg.static ?? [])
        const expectedShared = new Set(cfg.shared ?? [])
        const srv = nginxServers[String(cfg.listen)]
        if (srv) {
            const p1 = diff(`${name}/nginx static`, expectedStatic, srv.static)
            if (p1) problems.push(p1)
            const p2 = diff(`${name}/nginx shared`, expectedShared, srv.shared)
            if (p2) problems.push(p2)
        } else {
            problems.push(
                `${name}：nginx 里找不到 listen=${cfg.listen} 的 server 块（routing.yaml 与 shop.conf 端口不符）`,
            )
        }
        const p3 = diff(`${name}/vite proxy`, expectedStatic, viteProxies[name] ?? new Set())
        if (p3) problems.push(p3)
        if (expectedShared.size > 0) {
            const p4 = diff(
                `${name}/vite pageApiProxy shared`,
                expectedShared,
                viteShared[name] ?? new Set(),
            )
            if (p4) problems.push(p4)
        }
    }
    const p5 = diff("cors devOrigins", new Set(corsDev), corsActual)
    if (p5) problems.push(p5)
    return problems
}

function readSource(key) {
    return readFileSync(join(ROOT, SOURCES[key]), "utf8")
}

/** 读全部真实文件并跑一遍比对（脚本 main 与单测共用）。 */
export function loadAndCheck() {
    const routing = YAML.parse(readSource("routing"))
    const apps = routing.apps ?? {}
    const corsDev = routing.cors?.devOrigins ?? []
    const nginxServers = extractNginxServers(readSource("nginx"))
    const viteProxies = {
        web: extractViteProxyArray(readSource("webVite")),
        seller: extractViteProxyArray(readSource("sellerVite")),
        admin: extractViteProxyArray(readSource("adminVite")),
    }
    const viteShared = { web: extractViteSharedPaths(readSource("webVite")) }
    const corsActual = extractCorsOrigins(readSource("corsYml"))
    return checkRouting({ apps, corsDev, nginxServers, viteProxies, viteShared, corsActual })
}

function main() {
    const o = makeOut("routing:drift")
    const problems = loadAndCheck()
    if (problems.length === 0) {
        o.ok("路由/CORS 三处口径与 contracts/routing.yaml 一致")
        return
    }
    o.err(`路由/CORS 口径漂移（真相源 ${relative(ROOT, join(ROOT, SOURCES.routing))}）：`)
    for (const p of problems) o.rawErr(`  ${p}`)
    o.rawErr(
        `\n改法：以 routing.yaml 为准，同步改 nginx shop.conf / 各端 vite.config.ts / application.yml；`,
    )
    o.rawErr(`若确是口径变更，先改 routing.yaml 再改这三处。`)
    process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
