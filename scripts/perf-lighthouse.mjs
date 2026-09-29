#!/usr/bin/env node
/**
 * 首屏实验室性能测量（Lighthouse）。
 *
 * 跑什么：按 perf/pages.json 逐个 app（买家端 SSR + 两端工作台 SPA）生产构建 → 起 preview
 *        → 对组内页面各跑 N 轮 Lighthouse → 逐指标取中位数 → 落 perf/runs/<ts>/ 与
 *        perf/history.jsonl，并逐项和 perf/baseline.json 比差值打印。
 *
 * 为什么：Lighthouse 在 dev server 上跑出来的分不能当基线——dev 不压缩、不拆包、带
 *        devtools，JS 体积是生产的好几倍（实测同一页面 dev 39 / 生产构建 65）。这条量的是
 *        「构建产物的真实性能」，和 docs/conventions/frontend-monitoring.md 首批里那条
 *        RUM 侧 Web Vitals（真实用户 p75）是两套东西，互不替代。
 *
 * 是否阻断：不阻断。分数再低也退 0，现阶段只记录。只有测量本身没做成——后端不在场、
 *        构建失败、页面非 200、marker 没出现、Chrome 起不来——才退非 0，
 *        因为那种情况下记下来的是个假数。
 *
 * 用法：
 *   pnpm perf                                  # 三端逐个构建 + 起服务 + 全部页面 × 3 轮
 *   pnpm perf -- --samples 1                   # 快速迭代（单轮波动大，别拿来冻基线）
 *   pnpm perf -- --no-build --pages home       # 复用已有产物，只量首页
 *   pnpm perf -- --apps seller                 # 只量卖家工作台（端口 5000，要先关掉 dev 服务）
 *   pnpm perf -- --pages welcome               # 静态页单独量：这条不需要后端、不需要登录
 *   pnpm perf -- --preset desktop              # 桌面口径（基线按口径分开存）
 *   pnpm perf -- --baseline                    # 把本轮结果冻成新基线
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import lighthouse from "lighthouse"
import * as chromeLauncher from "chrome-launcher"
import desktopConfig from "lighthouse/core/config/desktop-config.js"

const ROOT = resolve(import.meta.dirname, "..")
const PERF_DIR = join(ROOT, "perf")
const RUNS_DIR = join(PERF_DIR, "runs")
const HISTORY_FILE = join(PERF_DIR, "history.jsonl")
const BASELINE_FILE = join(PERF_DIR, "baseline.json")
const PAGES_FILE = join(PERF_DIR, "pages.json")
/** vp 的 bin 是带 shebang 的纯 ESM：直接交给 node 起，绕开 Windows 下 .cmd 要走 shell 的问题 */
const VP_BIN = join(ROOT, "node_modules", "vite-plus", "bin", "vp")
const BACKEND = process.env.VITE_BACKEND_URL || "http://localhost:8080"
/** 只留最近这么多次运行目录：每次 3 页 × 数百 KB，不设上限迟早堆成垃圾场 */
const KEEP_RUNS = 20

/** 截图上那四个圈，口径与 Chrome DevTools / PageSpeed 一致 */
const SCORES = [
    { id: "performance", label: "性能" },
    { id: "accessibility", label: "无障碍" },
    { id: "best-practices", label: "最佳做法" },
    { id: "seo", label: "SEO" },
]

/**
 * 实验室能拿到的核心指标。INP 不在列——它要真实交互，实验室量不出来，见页脚说明。
 * `goodMax` 是 Lighthouse 打分用的同一组「良好」上限：没有它，一次跑完最刺眼的问题
 * 也只是 `CLS 0.630` 这种要人认的数字（实测第一次覆盖管理端时，全场最差的一项正是这样过去的）。
 * TTFB 不在这套阈值里（Lighthouse 只当参考信息，不计分），所以给个 null 而不是硬编一个数。
 */
const METRICS = [
    { key: "ttfb", audit: "server-response-time", label: "TTFB", unit: "ms", goodMax: null },
    { key: "fcp", audit: "first-contentful-paint", label: "FCP", unit: "ms", goodMax: 1800 },
    { key: "lcp", audit: "largest-contentful-paint", label: "LCP", unit: "ms", goodMax: 2500 },
    { key: "cls", audit: "cumulative-layout-shift", label: "CLS", unit: "", goodMax: 0.1 },
    { key: "tbt", audit: "total-blocking-time", label: "TBT", unit: "ms", goodMax: 200 },
    { key: "si", audit: "speed-index", label: "SI", unit: "ms", goodMax: 3400 },
]

/** 已经打印过修法的中断信号：抛出去只为让 finally 收到尾，顶层不再重复输出 */
class MeasuredFailed extends Error {}

/**
 * 测量没做成才走到这里：低分不是失败，假数才是。
 * 抛而不是 process.exit —— exit 会跳过 finally，把 preview 服务和 Chrome 泄漏在场上。
 * 显式标 never，调用点之后的类型收窄才成立（TS 不推断 never）。
 * @returns {never}
 */
function fail(message) {
    console.error(`\n[perf] ${message}`)
    throw new MeasuredFailed(message)
}

function positiveInt(flag, raw) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) fail(`${flag} 要一个正整数，收到 ${raw}`)
    return n
}

/**
 * @typedef {object} Options
 * @property {number} samples
 * @property {"mobile" | "desktop" | null} preset
 * @property {boolean} build
 * @property {string[] | null} only
 * @property {string[] | null} apps
 * @property {boolean} baseline
 * @property {boolean} help
 */

function parseArgs(argv) {
    /** @type {Options} */
    const opts = {
        samples: 3,
        preset: null,
        build: true,
        only: null,
        apps: null,
        baseline: false,
        help: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        // pnpm 12 会把分隔用的 `--` 原样透传进来，npm 会吞掉：两种都要能跑
        if (arg === "--") continue
        const next = () => {
            const value = argv[++i]
            if (value === undefined) fail(`参数 ${arg} 缺值`)
            return value
        }
        const csv = () =>
            next()
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
        switch (arg) {
            case "--help":
            case "-h":
                opts.help = true
                break
            case "--samples":
                opts.samples = positiveInt(arg, next())
                break
            case "--preset": {
                const value = next()
                if (value !== "mobile" && value !== "desktop")
                    fail(`--preset 只认 mobile / desktop，收到 ${value}`)
                opts.preset = value
                break
            }
            case "--pages":
                opts.only = csv()
                break
            case "--apps":
                opts.apps = csv()
                break
            case "--no-build":
                opts.build = false
                break
            case "--baseline":
                opts.baseline = true
                break
            default:
                fail(`未知参数 ${arg}（pnpm perf --help 看用法）`)
        }
    }
    return opts
}

function readJson(path, label) {
    if (!existsSync(path)) fail(`${label} 不存在：${path}`)
    return JSON.parse(readFileSync(path, "utf8"))
}

function git(args) {
    const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" })
    return r.status === 0 ? r.stdout.trim() : ""
}

function fetchWithTimeout(url, ms = 8000) {
    return fetch(url, { signal: AbortSignal.timeout(ms), redirect: "follow" })
}

/** vite 会把 URL 包在 ANSI 色码里，不剥掉就匹配不到行尾（\p{Cc} 免得正则里写字面控制字符） */
function stripAnsi(text) {
    return text.replaceAll(/\p{Cc}\[[0-9;]*m/gu, "")
}

/**
 * 往一个 CDP target 发一条命令并等它回。手写是因为仓库里没有 CDP 客户端依赖，
 * 而这里只用得上一条命令——为一个调用引 puppeteer-core 不划算。
 * @param {string} wsUrl
 * @param {string} method
 * @param {object} params
 */
function cdpSend(wsUrl, method, params) {
    return new Promise((ok, no) => {
        const ws = new WebSocket(wsUrl)
        const done = (fn) => {
            ws.close()
            fn()
        }
        ws.addEventListener("open", () => {
            ws.send(JSON.stringify({ id: 1, method, params }))
        })
        ws.addEventListener("error", () => done(() => no(new Error(`CDP 连不上 ${wsUrl}`))))
        ws.addEventListener("message", (event) => {
            const message = JSON.parse(event.data)
            // CDP 会先推一堆事件，只认这条命令的回应
            if (message.id !== 1) return
            done(() =>
                message.error
                    ? no(new Error(`${method} 被拒：${message.error.message}`))
                    : ok(message.result),
            )
        })
    })
}

/**
 * 给 Chrome 的 cookie jar 塞一条 cookie（走裸 CDP，不引新依赖）。
 *
 * 为什么不能用 Lighthouse 的 extraHeaders：那是加在**请求头**上的，工作台自己发的
 * `POST /auth/refresh` 走的是页面 fetch，不带那个头，于是永远换不到 access token、
 * 永远停在登录页。要进工作台必须让浏览器自己在发请求时带上，那就只能进 jar。
 *
 * 登录换来的 refresh token 是一次一换（rotate），而轮换后下发的新 cookie 标了 `Secure`，
 * 在 http://localhost 上浏览器不存——所以每轮都要重新登录、重新塞，不能塞一次用三轮。
 * @param {number} port
 * @param {string} origin
 * @param {{ cookie: string, cookiePath: string, value: string }} cookie
 */
async function setChromeCookie(port, origin, cookie) {
    const res = await fetchWithTimeout(`http://127.0.0.1:${port}/json/list`)
    const list = await res.json()
    const page = list.find((t) => t.type === "page")
    if (!page?.webSocketDebuggerUrl) {
        fail(`Chrome 的调试端口上找不到可注入 cookie 的 target（${cookie.cookie} 塞不进去）`)
    }
    await cdpSend(page.webSocketDebuggerUrl, "Network.setCookie", {
        name: cookie.cookie,
        value: cookie.value,
        // 用 url 而不是 domain+path：后者在 localhost 上会被 CDP 按字面域匹配掉
        url: origin + cookie.cookiePath,
        path: cookie.cookiePath,
        // 后端下发的确实是 Secure，但那是给 https 生产用的口径；本地明文测量
        // 只能按 localhost 的可信来源放宽，否则 jar 不收、请求不带
        secure: false,
        httpOnly: true,
        sameSite: "Lax",
    })
}

/**
 * 用演示账号换一个 refresh token。返回 cookie 值；拿不到就拒——
 * 没有它，工作台只会把人弹回登录页，而登录页的性能分和真实后台没有任何关系。
 * @param {string} origin
 * @param {{ login: string, cookie: string, cookiePath: string, account: object }} auth
 */
async function loginForCookie(origin, auth) {
    let res
    try {
        res = await fetch(`${BACKEND}${auth.login}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(auth.account),
            signal: AbortSignal.timeout(8000),
        })
    } catch (error) {
        fail(`${auth.login} 登录请求失败：${error.message}\n        后端要在场（pnpm dev:server）`)
    }
    if (!res.ok) {
        fail(
            `${auth.login} 登录返回 ${res.status}，量不了工作台。\n` +
                `        账号来自 perf/pages.json 的 auth.account（seed:demo 的演示号）。先 pnpm seed:demo 重灌，` +
                `        或确认 ${origin} 这端的代理前缀还在。`,
        )
    }
    const raw = res.headers.getSetCookie()
    const line = raw.find((c) => c.startsWith(`${auth.cookie}=`))
    if (!line) fail(`登录成功了但响应里没有 ${auth.cookie} 这个 cookie，无法进工作台`)
    return {
        cookie: auth.cookie,
        cookiePath: auth.cookiePath,
        value: decodeURIComponent(line.slice(auth.cookie.length + 1).split(";")[0]),
    }
}

/**
 * 一轮测量的入场：登录换一条 refresh cookie，塞进 Chrome 的 jar。
 *
 * 每轮都得重做，不能塞一次用三轮：refresh token 一次一换，而轮换后下发的新 cookie 带着
 * `Secure`，在 http://localhost 上浏览器不存——第二轮再拿那条已用旧的进去就是换不到 token、
 * 静默掉回登录页。少这一句，多轮测量量的会是「第一轮工作台 + 后面几轮登录页」。
 * @param {string} origin
 * @param {any} app
 * @param {number} chromePort
 */
async function enterWorkbench(origin, app, chromePort) {
    const cookie = await loginForCookie(origin, app.auth)
    await setChromeCookie(chromePort, origin, cookie)
}

/**
 * 工作台的 index.html 永远是壳，SSR 那套 marker 检查在这里用不上，
 * 所以「有没有真进去」只能看最终 URL：登录态没生效时 SPA 会把自己弹回登录页。
 * @param {any} page
 * @param {string} finalUrl
 * @param {string | undefined} loginPath
 */
function assertStayed(page, finalUrl, loginPath) {
    if (!loginPath) return
    let landed
    try {
        landed = new URL(finalUrl).pathname
    } catch {
        return
    }
    if (landed === loginPath) {
        fail(
            `${page.name} (${page.path}) 最终落回 ${loginPath}——量的是登录页，不是工作台。\n` +
                `        refresh cookie 没生效：确认后端在跑、演示账号有效（pnpm seed:demo）、` +
                `        且这一端跑在它约定的端口上（后端 CORS 只认固定端口）。`,
        )
    }
}

/**
 * 后端不在场时 SSR 页会出错误页或空壳，量它等于量一个假数，所以先探再跑。
 * 空壳页甚至可能拿高分——所以这里不是可选优化，是数据有效性的前提。
 */
async function requireBackend(pages) {
    if (!pages.some((p) => p.needsBackend)) return
    try {
        const res = await fetchWithTimeout(`${BACKEND}/v3/api-docs`, 3000)
        if (res.ok) return
    } catch {
        /* 连不上，走下面的修法 */
    }
    fail(
        `后端不在场（${BACKEND} 连不上）。\n` +
            `        首页与商详是 SSR，量出来会是错误页或空壳，数字没有意义。\n` +
            `        起法：pnpm dev:server（推荐，顺带拉起数据面）；只要数据面：pnpm db:up\n` +
            `        数据面在云上：SHOP_DATASTORE=remote pnpm db:up\n` +
            `        只想量静态落地页：pnpm perf -- --pages welcome`,
    )
}

/** 跑 Lighthouse 之前先确认页面真渲染出了内容，省得白跑几轮 */
async function verifyPages(origin, pages) {
    for (const page of pages) {
        let res
        try {
            // oxlint-disable-next-line no-await-in-loop -- 逐页探完就报第一个坏页面，并发探会把修法混成一段
            res = await fetchWithTimeout(origin + page.path)
        } catch (error) {
            fail(`${page.name} (${page.path}) 请求失败：${error.message}`)
        }
        const html = await res.text() // oxlint-disable-line no-await-in-loop -- 逐页探完就报第一个坏页面，并发探会把修法混成一段
        if (res.status !== 200) {
            fail(`${page.name} (${page.path}) 返回 ${res.status}，最终落在 ${res.url}`)
        }
        if (page.marker && !html.includes(page.marker)) {
            fail(
                `${page.name} (${page.path}) 是 200，但没出现标记 ${page.marker}\n` +
                    `        多半是 SSR 没取到数据——空壳页会拿高分，所以这条是硬检查。\n` +
                    `        确认后端与演示数据在位（pnpm seed:demo），或按 perf/pages.json 的 note 换钉住的商品。`,
            )
        }
    }
}

function startPreview(app) {
    const child = spawn(
        process.execPath,
        [VP_BIN, "preview", "--port", String(app.port), "--strictPort"],
        {
            cwd: join(ROOT, app.dir),
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
        },
    )
    let log = ""
    child.stdout.on("data", (chunk) => (log += stripAnsi(String(chunk))))
    child.stderr.on("data", (chunk) => (log += stripAnsi(String(chunk))))
    let exited = null
    child.on("exit", (code) => (exited = code))
    return {
        /**
         * 返回服务真正落在哪个 origin。端口是从子进程日志里读出来的而不是直接拼 --port：
         * vite 在端口被占时会自己挪到下一个，若不读回来，就会拿旧端口去量别人的服务。
         * （--strictPort 已经让它在被占时直接拒绝，这里是第二道，防的是以后有人去掉那个 flag。）
         */
        async waitReady() {
            for (let i = 0; i < 40; i++) {
                const bound = log.match(/Local:\s+(https?:\/\/\S+?)\/?\s*$/m)
                if (bound) {
                    const origin = bound[1]
                        .replaceAll("0.0.0.0", "localhost")
                        .replaceAll("[::]", "localhost")
                    try {
                        // oxlint-disable-next-line no-await-in-loop -- 就绪轮询本质串行，并发探等于不看
                        const res = await fetchWithTimeout(`${origin}${app.probe}`, 2000)
                        if (res.ok) return origin
                    } catch {
                        /* 端口打印出来了但还没能应答，继续等 */
                    }
                }
                if (exited !== null) break
                // oxlint-disable-next-line no-await-in-loop -- 轮询睡眠必须串行等待，无法并行
                await new Promise((r) => setTimeout(r, 500))
            }
            console.error(log)
            fail(`${app.label} 的 preview 服务没起来（端口 ${app.port}，子进程退出码 ${exited}）`)
        },
        stop() {
            if (exited !== null || child.pid == null) return
            if (process.platform === "win32") {
                spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
            } else {
                try {
                    process.kill(-child.pid, "SIGTERM")
                } catch {
                    child.kill("SIGTERM")
                }
            }
        },
    }
}

async function portBusy(port) {
    try {
        const res = await fetchWithTimeout(`http://localhost:${port}/`, 1000)
        return res.status > 0
    } catch {
        return false
    }
}

function buildApp(app) {
    // 构建走 pnpm script（命令口径的唯一出口）；preview 不走，因为要握住子进程句柄才收得掉它。
    // 整条命令写成一个字符串：shell:true 下传 args 数组会被 Node 判为拼接注入风险（DEP0190）
    const r = spawnSync(`pnpm ${app.build}`, { cwd: ROOT, stdio: "inherit", shell: true })
    if (r.status !== 0) fail(`构建失败（pnpm ${app.build}，退出码 ${r.status}）`)
}

function pickScores(lhr) {
    const out = {}
    for (const { id } of SCORES) {
        const score = lhr.categories[id]?.score
        out[id] = score == null ? null : Math.round(score * 100)
    }
    return out
}

function pickMetrics(lhr) {
    const out = {}
    for (const { key, audit, unit } of METRICS) {
        const value = lhr.audits[audit]?.numericValue
        out[key] = value == null ? null : unit === "" ? Number(value.toFixed(3)) : Math.round(value)
    }
    return out
}

/** 不达标的性能审计，按预估收益排——将来做优化时这就是现成的待办清单 */
function pickOpportunities(lhr, limit = 6) {
    return (lhr.categories.performance?.auditRefs ?? [])
        .map((ref) => lhr.audits[ref.id])
        .filter((a) => a && a.score != null && a.score < 0.9)
        .map((a) => ({
            id: a.id,
            savingsMs: Math.round(a.details?.overallSavingsMs ?? 0),
            displayValue: a.displayValue ?? "",
        }))
        .toSorted((x, y) => y.savingsMs - x.savingsMs || x.id.localeCompare(y.id))
        .slice(0, limit)
}

function median(values) {
    const nums = values.filter((v) => v != null).toSorted((a, b) => a - b)
    if (nums.length === 0) return null
    const mid = nums.length >> 1
    return nums.length % 2 ? nums[mid] : Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(3))
}

function range(values) {
    const nums = values.filter((v) => v != null)
    return nums.length < 2 ? 0 : Math.round((Math.max(...nums) - Math.min(...nums)) * 100) / 100
}

/** 取 LCP 最接近中位数的那一轮当代表：报表要指向「典型的一轮」，不是最好或最差的那次 */
function representativeIndex(samples) {
    const lcpMedian = median(samples.map((s) => s.metrics.lcp))
    let best = 0
    let bestGap = Infinity
    samples.forEach((sample, index) => {
        const value = sample.metrics.lcp
        if (value == null) return
        const gap = Math.abs(value - (lcpMedian ?? 0))
        if (gap < bestGap) {
            bestGap = gap
            best = index
        }
    })
    return best
}

function formatValue(value, unit) {
    if (value == null) return "n/a"
    if (unit === "") return value.toFixed(3)
    if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
    return `${value}${unit}`
}

/**
 * 性能指标一律「越小越好」，分数「越大越好」，所以箭头统一读作「变好 / 变差」。
 * 小于噪声下限的差不打印——同一台机器同一份产物两次跑 LCP 能差 700ms，
 * 把 0.5ms 印成「↓0.5ms」是拿抖动冒充信号。
 */
const NOISE_FLOOR = { ms: 50, "": 0.005 }

function deltaText(current, baseline, unit) {
    if (current == null || baseline == null) return ""
    const diff = current - baseline
    if (Math.abs(diff) <= (NOISE_FLOOR[unit] ?? 0)) return ""
    const shown =
        unit === "" ? Math.abs(diff).toFixed(3) : formatValue(Math.round(Math.abs(diff)), unit)
    return `${diff > 0 ? "↓" : "↑"}${shown}`
}

/**
 * ↑/↓ 说的是「和上次比」，⚠ 说的是「和及格线比」——基线还没冻、或冻的时候这页本来就烂，
 * 前者会什么都不印，而页面照样能拿个不难看的分数。
 */
function overMark(value, goodMax) {
    if (value == null || goodMax == null || value <= goodMax) return ""
    return "⚠"
}

function loadBaseline(preset) {
    if (!existsSync(BASELINE_FILE)) return null
    return readJson(BASELINE_FILE, "基线")[preset] ?? null
}

function saveBaseline(preset, run) {
    const all = existsSync(BASELINE_FILE) ? readJson(BASELINE_FILE, "基线") : {}
    all[preset] = {
        schema: 1,
        ts: run.ts,
        version: run.version,
        pages: Object.fromEntries(
            Object.values(run.pages).map((page) => [
                page.slug,
                { app: page.app, scores: page.scores, metrics: page.metrics },
            ]),
        ),
    }
    writeFileSync(BASELINE_FILE, `${JSON.stringify(all, null, 4)}\n`)
}

function pruneRuns() {
    if (!existsSync(RUNS_DIR)) return
    for (const dir of readdirSync(RUNS_DIR).toSorted().slice(0, -KEEP_RUNS)) {
        rmSync(join(RUNS_DIR, dir), { recursive: true, force: true })
    }
}

function writeRun(run, dir) {
    mkdirSync(dir, { recursive: true })
    for (const page of Object.values(run.pages)) {
        writeFileSync(join(dir, `${page.slug}.json`), page.raw)
        writeFileSync(join(dir, `${page.slug}.html`), page.html)
    }
    const slim = (extra) =>
        Object.fromEntries(
            Object.values(run.pages).map((page) => [
                page.slug,
                {
                    name: page.name,
                    app: page.app,
                    finalUrl: page.finalUrl,
                    scores: page.scores,
                    metrics: page.metrics,
                    ...extra(page),
                },
            ]),
        )
    // 逐页原始报表只落盘、不进记录：history.jsonl 每行都要能一眼读完
    const { pages: _pages, ...meta } = run
    writeFileSync(
        join(dir, "summary.json"),
        JSON.stringify(
            {
                ...meta,
                pages: slim((p) => ({ lcpSamples: p.lcpSamples, opportunities: p.opportunities })),
            },
            null,
            4,
        ),
    )
    writeFileSync(HISTORY_FILE, `${JSON.stringify({ ...meta, pages: slim(() => ({})) })}\n`, {
        flag: "a",
    })
}

function printReport(run, baseline, froze) {
    console.log(
        `\n══ ${run.preset} · ${run.version || "无 git sha"}${run.dirty ? " (工作区有改动)" : ""} · ${run.ts} ══`,
    )
    let lastApp = null
    for (const page of Object.values(run.pages)) {
        const base = baseline?.pages?.[page.slug]
        // 一次跑三端，报表要先按端分一段，否则「商品管理」和「商品详情」看着像同一个东西
        if (page.app !== lastApp) {
            console.log(`\n── ${page.app ?? "买家端"} ──`)
            lastApp = page.app
        }
        console.log(`\n${page.name}  ${page.finalUrl.replace(/^https?:\/\/[^/]+/, "")}`)
        console.log(
            `  得分  ${SCORES.map(({ id, label }) => {
                const value = page.scores[id]
                const d =
                    value != null && base?.scores?.[id] != null ? value - base.scores[id] : null
                return `${label} ${value ?? "n/a"}${d && Math.abs(d) >= 1 ? ` ${d > 0 ? "↑" : "↓"}${Math.abs(d)}` : ""}`
            }).join("   ")}`,
        )
        console.log(
            `  指标  ${METRICS.map(
                ({ key, label, unit, goodMax }) =>
                    `${label} ${formatValue(page.metrics[key], unit)}${deltaText(page.metrics[key], base?.metrics?.[key], unit)}${overMark(page.metrics[key], goodMax)}`,
            ).join("   ")}`,
        )
        console.log(
            `  波动  LCP ${page.lcpSamples.join("/")}，极差 ${range(page.lcpSamples)}ms（${run.samples} 轮取中位数）`,
        )
        const top = page.opportunities.filter((o) => o.savingsMs > 0).slice(0, 4)
        if (top.length > 0)
            console.log(
                `  待办  ${top.map((o) => `${o.id} ~${formatValue(o.savingsMs, "ms")}`).join("  ")}`,
            )
        console.log(`  报表  perf/runs/${run.stamp}/${page.slug}.html`)
    }
    console.log(
        `\n── 只记录，不阻断：分数再低也退 0。\n` +
            `   ↑/↓ 读作「变好/变差」；差值小于 ${NOISE_FLOOR.ms}ms（CLS ${NOISE_FLOOR[""]}）不打印，那是本机重跑的抖动量级。\n` +
            `   ⚠ 是越过官方「良好」上限（FCP 1.8s / LCP 2.5s / CLS 0.1 / TBT 200ms / SI 3.4s）——和及格线比，不是和上一次比。\n` +
            `   INP 实验室量不到（要真实交互），那条在 RUM 侧，见 docs/conventions/frontend-monitoring.md 首批 · Web Vitals。\n` +
            `   本地测量会把机器负载算进结果：跨机器、跨时段不可比，只和同机器的上一次与基线比。\n` +
            (baseline || froze
                ? `   历史 perf/history.jsonl，本轮逐页报表 perf/runs/${run.stamp}/\n`
                : `   还没有 ${run.preset} 基线：pnpm perf -- --baseline 冻一份，之后每次跑都会打差值\n`) +
            (froze
                ? `   ${run.preset} 这一段已用本轮覆盖`
                : `   冻基线：pnpm perf -- --baseline（覆盖 perf/baseline.json 里 ${run.preset} 这一段）`),
    )
}

/**
 * 冻基线是覆盖写，所以口径必须完整：只量子集就 --baseline，会把基线里其它页面静默清掉，
 * 下次跑再没有对比对象；单轮同理，一轮的极差就是噪声本身，冻进去等于把噪声当尺子。
 */
function guardBaseline(opts, pages, allSlugs) {
    if (!opts.baseline) return
    if (opts.samples < 2)
        fail("--baseline 要至少 2 轮（默认 3）：单轮波动就是噪声，冻进基线会把尺子本身弄歪")
    const measured = new Set(pages.map((p) => p.slug))
    const missing = allSlugs.filter((slug) => !measured.has(slug))
    if (missing.length > 0) {
        fail(
            `--baseline 会覆盖 perf/baseline.json，但本轮只量了 ${[...measured].join(" / ")}，缺 ${missing.join(" / ")}。\n` +
                `        基线要覆盖整套页面才有可比性：去掉 --pages / --apps 跑全量再冻。`,
        )
    }
}

/**
 * 选出口径：哪些 app、每个 app 里哪些页。
 * @param {{ apps: any[] }} config
 * @param {Options} opts
 */
function selectGroups(config, opts) {
    const allSlugs = config.apps.flatMap((a) => a.pages.map((p) => p.slug))
    let apps = config.apps
    if (opts.apps) {
        apps = apps.filter((a) => opts.apps.includes(a.name))
        if (apps.length === 0)
            fail(`--apps 没匹配到，可选：${config.apps.map((a) => a.name).join(" / ")}`)
    }
    const groups = apps
        .map((app) => ({
            app,
            pages: opts.only ? app.pages.filter((p) => opts.only.includes(p.slug)) : app.pages,
        }))
        .filter((g) => g.pages.length > 0)
    if (groups.length === 0) fail(`--pages 没匹配到页面，可选：${allSlugs.join(" / ")}`)
    return { groups, allSlugs }
}

/**
 * 一个 app：构建 → 起它自己的 preview → 逐页 × N 轮。
 * 端口不统一是刻意的——后端 CORS 只认各端约定的那几个（5000 / 4000），换端口就量不到工作台。
 * @param {any} app
 * @param {any[]} pages
 * @param {Options} opts
 * @param {string} preset
 * @param {number} chromePort
 * @param {Record<string, { page: any, app: any, samples: any[] }>} collected
 */
async function measureGroup(app, pages, opts, preset, chromePort, collected) {
    if (opts.build) {
        console.log(`[perf] 构建 ${app.label}（pnpm ${app.build}，--no-build 可跳过）…`)
        buildApp(app)
    } else if (!existsSync(join(ROOT, app.dir, "dist"))) {
        fail(
            `--no-build 但 ${app.label} 没有构建产物（${app.dir}/dist 不存在），去掉 --no-build 先跑一次`,
        )
    }
    if (
        // oxlint-disable-next-line no-await-in-loop -- 逐 app 串行是前提：并发量等于让两端抢 CPU
        await portBusy(app.port)
    ) {
        fail(
            `${app.label} 的端口 ${app.port} 已有服务在应答（多半是 pnpm dev:${app.name}）。\n` +
                `        先关掉它——在被占用的服务上量，量的不是这次构建。这个端口也不能换：后端 CORS 只认它。`,
        )
    }

    const server = startPreview(app)
    let origin
    try {
        origin = await server.waitReady()
        console.log(`[perf] ${app.label} 在 ${origin}，逐页跑 ${opts.samples} 轮…`)
        await verifyPages(origin, pages)

        for (const page of pages) {
            const samples = []
            for (let i = 0; i < opts.samples; i++) {
                // oxlint-disable-next-line no-await-in-loop -- 同一个 Chrome 里并发跑会互相抢线程，量出来的就不是页面而是机器；串行 + 中位数是这套测量成立的前提
                if (app.auth) await enterWorkbench(origin, app, chromePort)
                // oxlint-disable-next-line no-await-in-loop -- 同上，串行是前提
                const result = await lighthouse(
                    origin + page.path,
                    {
                        port: chromePort,
                        output: ["json", "html"],
                        logLevel: "error",
                        // 有登录态才需要：Lighthouse 默认每轮清 storage，会把刚塞进去的 cookie 清掉
                        ...(app.auth ? { disableStorageReset: true } : {}),
                    },
                    preset === "desktop" ? desktopConfig : undefined,
                )
                if (!result) fail(`${page.name} 第 ${i + 1} 轮 Lighthouse 没出结果`)
                const { lhr } = result
                if (lhr.runtimeError)
                    fail(
                        `${page.name} Lighthouse 报错：${lhr.runtimeError.code} ${lhr.runtimeError.message}`,
                    )
                assertStayed(page, lhr.finalDisplayedUrl, app.loginPath)
                samples.push({
                    metrics: pickMetrics(lhr),
                    scores: pickScores(lhr),
                    raw: result.report[0],
                    html: result.report[1],
                })
                process.stdout.write(
                    `       ${page.name} ${i + 1}/${opts.samples} LCP=${samples[i].metrics.lcp ?? "n/a"}ms\n`,
                )
            }
            collected[page.slug] = { page, app, samples }
        }
    } finally {
        server.stop()
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    if (opts.help) {
        console.log(
            readFileSync(new URL(import.meta.url), "utf8")
                .match(/\/\*\*\n([\s\S]*?)\n \*\/\nimport/)[1]
                .replaceAll(/^ \* ?/gm, ""),
        )
        return
    }

    const config = readJson(PAGES_FILE, "页面清单")
    const preset = opts.preset ?? config.preset ?? "mobile"
    const { groups, allSlugs } = selectGroups(config, opts)
    const pages = groups.flatMap((g) => g.pages)
    guardBaseline(opts, pages, allSlugs)

    await requireBackend(pages)
    // pages.json 里的账号是 seed:demo 的演示号、口令是公开的。只准对本地后端用——
    // 有人把 VITE_BACKEND_URL 指到预发/生产，这条会替他拦住，而不是静默拿公开口令去撞真账号
    if (
        groups.some((g) => g.app.auth) &&
        !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BACKEND)
    ) {
        fail(
            `要量的端里有工作台，但后端不是 localhost（${BACKEND}）。\n` +
                `        perf/pages.json 里是 seed:demo 的公开演示账号，不往真环境递。\n` +
                `        只想量买家端：pnpm perf -- --apps web`,
        )
    }

    let chrome
    try {
        chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--disable-gpu"] })
    } catch {
        fail("Chrome 起不来。装一个 Chrome，或设 CHROME_PATH 指向 chrome.exe / msedge.exe")
    }

    /** 键是 slug，跨 app 唯一：基线与 history 都按它取，改名等于换尺子 */
    const collected = {}
    try {
        for (const { app, pages: groupPages } of groups) {
            // oxlint-disable-next-line no-await-in-loop -- 逐 app 串行是前提：一个 app 起服务时另一个还在量
            await measureGroup(app, groupPages, opts, preset, chrome.port, collected)
        }
    } finally {
        try {
            chrome.kill() // chrome-launcher 1.2 的 kill() 是同步的，返回 undefined
        } catch {
            /* 收尾时 Chrome 可能已经退了 */
        }
    }

    /** 目录名要能按字典序排（pruneRuns 靠这个），所以留 ISO 形状，只把冒号换掉 */
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", ".")
    const run = {
        ts: new Date().toISOString(),
        stamp,
        version: git(["rev-parse", "--short", "HEAD"]),
        branch: git(["branch", "--show-current"]),
        dirty: git(["status", "--porcelain"]).length > 0,
        preset,
        samples: opts.samples,
        apps: groups.map((g) => g.app.name),
        pages: {},
    }
    for (const [slug, { page, app, samples }] of Object.entries(collected)) {
        const rep = samples[representativeIndex(samples)]
        const lhr = JSON.parse(rep.raw)
        run.pages[slug] = {
            slug,
            name: page.name,
            app: app.label,
            path: page.path,
            finalUrl: lhr.finalDisplayedUrl ?? page.path,
            scores: Object.fromEntries(
                SCORES.map(({ id }) => [id, median(samples.map((s) => s.scores[id]))]),
            ),
            metrics: Object.fromEntries(
                METRICS.map(({ key }) => [key, median(samples.map((s) => s.metrics[key]))]),
            ),
            lcpSamples: samples.map((s) => s.metrics.lcp),
            opportunities: pickOpportunities(lhr),
            raw: rep.raw,
            html: rep.html,
        }
    }

    writeRun(run, join(RUNS_DIR, stamp))
    pruneRuns()
    const baseline = loadBaseline(preset)
    if (opts.baseline) {
        saveBaseline(preset, run)
        console.log(`[perf] 本轮已冻成 ${preset} 基线：perf/baseline.json`)
    }
    printReport(run, baseline, opts.baseline)
}

try {
    await main()
} catch (error) {
    if (!(error instanceof MeasuredFailed)) console.error(`[perf] 测量中断：${error.message}`)
    process.exitCode = 1
}
