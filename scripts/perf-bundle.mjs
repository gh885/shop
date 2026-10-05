#!/usr/bin/env node
/**
 * 产物体积测量：三端 dist 的 gzip 字节，按 target × 类型汇总，与 perf/bundle-baseline.json 比差值。
 *
 * 跑什么：构建 web / seller / admin → 逐个 dist 目录算 gzip 字节 → 按 (target, 类型) 汇总，
 *        再按去掉 hash 的 chunk 名排出最大的几个 → 落 perf/bundle-history.jsonl 并打印与基线的差。
 *        额外量一条**首屏 JS**（HTML 入口的静态 import 闭包，见 FIRST_SCREEN）：dist 总量是「全部」，
 *        首屏才是「决定 LCP 的那一部分」，两者在代码分割后可能差出一倍，必须分开看。
 *
 * 为什么要它：Lighthouse 那份是**估算**且带机器噪声（同一份产物连跑三次，首页 LCP 实测
 *        5862 / 5863 / 6603ms）。产物体积是精确、零噪声、秒级可比的数字——它是「有人加了个
 *        3MB 依赖」这类回归最便宜的探测器，也是本项目在没有真实用户、没有 CI 门禁之前，
 *        唯一一个每次改动都能立刻相信的性能数字。
 *
 * 它看不见什么：chunk 名是 Rolldown autoCodeSplitting 生成的，最大的几个叫 src-*.js / link-*.js，
 *        **从名字看不出里面装了什么**。所以这份测量能回答「变大了没有、涨了哪一类、首屏多重」，
 *        回答不了「首屏里该拆谁」。后者要模块级归属，由 `pnpm perf:attrib` 用 sourcemap 把字节
 *        归因到源文件（三端构建已开 build.sourcemap: "hidden"）——它同时钉住「是谁把 X 带进首屏」。
 *
 * 是否阻断：默认不阻断（记录模式，与 pnpm perf 同一口径）；加 `--check` 才是门禁，
 *        与 perf/bundle-baseline.json 比，超出预算即退出码 1。CI 上跑的是 `--check`。
 *        之所以敢让它阻断：这一项没有测量噪声（gzip 字节精确、可复现），阈值不会误报。
 *        `--check` 还会**先确认比得成**：基线缺失、基线里缺某个 target、首屏探针没量到、
 *        产物为空——这些「量不到」同样退出码 1（记录模式则照旧跳过）。理由见 checkPrerequisites。
 *
 * 用法：
 *   pnpm perf:bundle                  # 构建三端再量（默认，保证量的是当前工作区）
 *   pnpm perf:bundle -- --no-build    # 复用已有 dist
 *   pnpm perf:bundle -- --baseline    # 把本轮冻成基线
 *   pnpm perf:bundle -- --check       # 门禁：超预算退出码 1（CI 用这条）
 *   pnpm perf:bundle -- --help        # 参数与目标清单
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { gzipSync } from "node:zlib"

const ROOT = resolve(import.meta.dirname, "..")
const BASELINE_FILE = join(ROOT, "perf", "bundle-baseline.json")
const HISTORY_FILE = join(ROOT, "perf", "bundle-history.jsonl")

/**
 * web 是 SSR，产物分两半且代价不同：client 决定 LCP，server 决定 TTFB。
 * 混在一起量，一次只改服务端代码的提交会显示成「包涨了」，所以分开。
 */
const TARGETS = [
    { name: "web/client", dir: "apps/web/dist/client", build: "build:web" },
    { name: "web/server", dir: "apps/web/dist/server", build: "build:web" },
    { name: "seller", dir: "apps/seller/dist", build: "build:seller" },
    { name: "admin", dir: "apps/admin/dist", build: "build:admin" },
]

/**
 * 首屏探针（每个 target 一份 HTML 入口）。
 *
 * 为什么要单独量「首屏」而光有 dist 总量：dist 总量回答「这次改动往用户手机上多塞了多少字节（全部）」，
 * 但首屏只下载**首屏用得到**的那部分——路由级代码分割 + 懒加载后，两者可以差出一倍。
 * 一个改动完全可能「总量 +2KB、首屏 +180KB」（或反过来），只盯总量会完全看不见 LCP 相关的回归。
 * Lighthouse 那份能间接反映首屏，但它是带机器噪声的估算值；这里的首屏是**精确、零噪声**的字节数，
 * 正好符合本文件「要设门禁先设它」的口径。
 *
 * 只覆盖 seller / admin 两端：它们是纯 SPA，dist 根下就有 index.html。
 * **web/client 量不了**——它的 prerender 已关闭（apps/web/vite.config.ts 里
 * `prerender: { enabled: false }`），dist/client 下只有 assets/，没有 HTML 入口，
 * 也就没有「入口 + 静态 import 闭包」可追。之前这里配的是预渲染时代的 `welcome/index.html`，
 * 该文件早已不存在，于是每轮都静默降级成「本轮不记首屏」——一个永远为空的探针比没有更坏，
 * 因为它看着像在量。web 的首屏要能量，得先恢复 prerender 或改用 client manifest，那是独立议题。
 */
const FIRST_SCREEN = {
    seller: "index.html",
    admin: "index.html",
}

const CATEGORIES = [
    { key: "js", exts: [".js"] },
    { key: "css", exts: [".css"] },
    { key: "html", exts: [".html"] },
]
const FALLBACK = "other"

/** Rolldown 的 hash 每次构建都变，比不了。剥掉它，同一个 chunk 前后两轮才认得出来 */
const HASHED = /-[A-Za-z0-9_-]{6,}\.([a-z]+)$/

/** 只有「量不出来」才是失败：构建没成、dist 不在，都是假数的来源 */
class BundleFailed extends Error {}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
    console.error(`\n[perf:bundle] ${message}`)
    throw new BundleFailed(message)
}

function walk(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(path))
        else out.push(path)
    }
    return out
}

function categoryOf(file) {
    for (const category of CATEGORIES) {
        if (category.exts.some((ext) => file.endsWith(ext))) return category.key
    }
    return FALLBACK
}

function measure(dir) {
    const totals = {}
    const chunks = {}
    for (const file of walk(dir)) {
        const gzip = gzipSync(readFileSync(file)).length
        const category = categoryOf(file)
        const bucket = (totals[category] ??= { files: 0, gzip: 0 })
        bucket.files += 1
        bucket.gzip += gzip
        if (category === "js" || category === "css") {
            // 同名（剥 hash 后）的多个 chunk 合并计：src-*.js 会塌成一个 src.js，那是诚实的
            // 分隔符统一成 /：基线是要进 git 的，反斜杠版在别的机器上对不上名
            const name = relative(dir, file).split(sep).join("/").replace(HASHED, ".$1")
            const chunk = (chunks[name] ??= { files: 0, gzip: 0 })
            chunk.files += 1
            chunk.gzip += gzip
        }
    }
    return { totals, chunks }
}

function sumGzip(totals) {
    return Object.values(totals).reduce((acc, bucket) => acc + bucket.gzip, 0)
}

/**
 * 量一个 HTML 入口的首屏 JS：HTML 里声明的 `<script src>` / `<link rel=modulepreload>`
 * 加上它们的**静态 import 闭包**（相对路径 `./x.js`），逐个 gzip 求和。
 *
 * 只走静态 import，不追 `import()` 动态导入——那些是按需/懒加载的，本就不该进首屏。
 * 路由级代码分割（TanStack autoCodeSplitting）正是靠动态 import 实现的，所以这个口径
 * 能正确地把「非当前路由的页面代码」排除在外。
 *
 * 返回 `{ chunks, gzip }`；入口或任一被引 chunk 缺失时返回 null（调用方负责降级）。
 */
function measureFirstScreen(dir, htmlRelPath) {
    const htmlFile = join(dir, htmlRelPath)
    if (!existsSync(htmlFile)) return null
    const html = readFileSync(htmlFile, "utf8")
    const assetsDir = join(dir, "assets")
    if (!existsSync(assetsDir)) return null

    // HTML 里的入口：<script src="/assets/x.js"> 与 <link href="/assets/x.js">
    const refs = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1])

    const queue = [...new Set(refs)]
    const seen = new Set()
    while (queue.length > 0) {
        const name = queue.pop()
        if (seen.has(name)) continue
        seen.add(name)
        const file = join(assetsDir, name)
        if (!existsSync(file)) continue
        const code = readFileSync(file, "utf8")
        // 静态 import：只认同目录的相对兄弟 "./x.js"（产物 chunk 之间的引用形式）。
        // 关键词与引号之间只允许空白：写成 \(?\s*" 会把 `import("./x.js")` 也认下来，
        // 于是按需加载的 chunk 被算进首屏——摇树一改切块变多，假首屏跟着虚涨。
        for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
            if (!seen.has(m[1])) queue.push(m[1])
        }
    }

    let gzip = 0
    for (const name of seen) {
        const file = join(assetsDir, name)
        if (existsSync(file)) gzip += gzipSync(readFileSync(file)).length
    }
    return { chunks: seen.size, gzip }
}

function git(args) {
    const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" })
    return r.status === 0 ? r.stdout.trim() : ""
}

/** 1KB 以下印 KB 会变成「0KB」，看着像坏了 */
function formatKb(bytes) {
    if (bytes < 1024) return `${bytes}B`
    return `${(bytes / 1024).toFixed(0)}KB`
}

/** 体积没有噪声，所以差值一律打印，不设下限；0.5KB 以下的舍入抖动除外 */
function delta(current, baseline) {
    if (baseline == null) return ""
    const diff = current - baseline
    if (Math.abs(diff) < 512) return ""
    return diff > 0 ? ` ↑${formatKb(diff)}` : ` ↓${formatKb(-diff)}`
}

function topChunks(chunks, limit) {
    return Object.entries(chunks)
        .map(([name, value]) => ({ name, files: value.files, gzip: value.gzip }))
        .toSorted((a, b) => b.gzip - a.gzip)
        .slice(0, limit)
}

/** `--check` 的默认预算：相对基线的涨幅上限（百分比）。 */
const DEFAULT_BUDGET_PERCENT = 5

function parseArgs(argv) {
    const opts = {
        build: true,
        baseline: false,
        check: false,
        noHistory: false,
        budget: DEFAULT_BUDGET_PERCENT,
        help: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === "--") continue
        else if (arg === "-h" || arg === "--help") opts.help = true
        else if (arg === "--no-build") opts.build = false
        else if (arg === "--baseline") opts.baseline = true
        else if (arg === "--check") opts.check = true
        else if (arg === "--no-history") opts.noHistory = true
        else if (arg === "--budget") {
            const value = argv[++i]
            if (value === undefined) fail("--budget 需要一个百分比，例如 --budget 5")
            opts.budget = Number(value)
            if (!Number.isFinite(opts.budget) || opts.budget < 0)
                fail(`--budget 需要非负数字，收到 ${value}`)
        } else fail(`未知参数 ${arg}`)
    }
    // 同时冻结又判定没有意义：刚写完的基线必然通过，等于没判
    if (opts.baseline && opts.check) fail("--baseline 与 --check 不能同时用（冻结后判定必然通过）")
    return opts
}

/**
 * `--check` 的前置校验：门禁得**真的比过**才算通过。
 *
 * 为什么要在比对之前单独走一步：`checkBudget` 只在「两侧都有数」时才比，缺一侧就静默跳过——
 * 那是为了让记录模式（不带 `--check`）不至于因为还没有基线就炸。但同一个「跳过」放进门禁里
 * 就变成了漏洞：整份基线被删、基线里某个 target 的条目被清掉、首屏探针因为 index.html 不见了
 * 而没量到——这些都会让 `--check` 报「通过」。坏掉的探针和误删的基线于是伪装成绿色 CI，
 * 而这恰恰是这份门禁唯一要防的事。
 *
 * 所以：**记录模式可以跳过，`--check` 一律把「量不到」判成失败**。三类必比项：
 *   ① 基线本身在不在；② 基线里四个 target 的合计、以及每个首屏探针的基线值在不在；
 *   ③ 本轮这四项有没有量到（dist 空的、index.html 丢了的，都算没量到）。
 *
 * @returns {string[]} 量不到的项（空数组 = 所有必比项都在，可以进入比对）
 */
function checkPrerequisites(baseline, results, firstScreen) {
    const problems = []
    if (!baseline) {
        problems.push(
            "基线文件不存在（perf/bundle-baseline.json）——没有可比对象，先 pnpm perf:bundle -- --baseline",
        )
        return problems
    }
    for (const target of TARGETS) {
        const base = baseline.targets?.[target.name]
        if (!base || sumGzip(base.totals ?? {}) <= 0) {
            problems.push(`基线里没有 ${target.name} 的合计项（或为 0）——重新冻基线`)
        }
        if (sumGzip(results[target.name].totals) <= 0) {
            problems.push(`${target.name} 本轮合计为 0——${target.dir} 里一个文件都没量到`)
        }
    }
    for (const [name, probe] of Object.entries(FIRST_SCREEN)) {
        const baseScreen = baseline.firstScreen?.[name]?.gzip
        if (!baseScreen || baseScreen <= 0) {
            problems.push(`基线里没有 ${name} 的首屏项（或为 0）——重新冻基线`)
        }
        const screen = firstScreen[name]
        if (!screen || screen.missing) {
            problems.push(
                `${name} 本轮没量到首屏——${probe} 或 assets/ 不在（先 pnpm build:${name}）`,
            )
        } else if (screen.chunks === 0) {
            // HTML 里一个 /assets/*.js 引用都没追到：多半是产物形态变了、探针的正则失效了，
            // 而不是「首屏真的是 0 字节」。这种静默降级比报错更坏——它看着像在量。
            problems.push(`${name} 本轮首屏追到 0 个 chunk——${probe} 里没有 /assets/*.js 引用`)
        } else if (screen.gzip <= 0) {
            problems.push(`${name} 本轮首屏 gzip 为 0——追到的 chunk 都是空文件`)
        }
    }
    return problems
}

/**
 * 门禁判定：把每个 target 的「合计 gzip」与「首屏 JS gzip」分别与基线比，超出预算就列出来。
 *
 * 只判「涨」的方向：变小永远是好消息，不需要拦。两侧有一侧没数就跳过那一项——这一层的
 * 「跳过」是留给记录模式的；`--check` 下它轮不到生效，因为 {@link checkPrerequisites}
 * 已经先把「量不到」判成失败了（「量不到」与「超预算」是两种完全不同的失败，混在一起
 * 就会让坏掉的探针伪装成绿色）。
 *
 * @returns {string[]} 超预算的条目描述（空数组 = 通过）
 */
function checkBudget(baseline, results, firstScreen, budgetPercent) {
    const limit = 1 + budgetPercent / 100
    const violations = []
    const compare = (label, current, base) => {
        if (base == null || current == null) return
        if (current > base * limit) {
            violations.push(
                `${label}：${formatKb(base)} → ${formatKb(current)}（+${formatKb(current - base)}，超 +${budgetPercent}% 预算）`,
            )
        }
    }
    for (const target of TARGETS) {
        const base = baseline?.targets?.[target.name]
        compare(
            `${target.name} 合计`,
            sumGzip(results[target.name].totals),
            base ? sumGzip(base.totals) : null,
        )
        const screen = firstScreen[target.name]
        if (screen && !screen.missing) {
            compare(
                `${target.name} 首屏 JS`,
                screen.gzip,
                baseline?.firstScreen?.[target.name]?.gzip,
            )
        }
    }
    return violations
}

function buildTargets() {
    const scripts = new Set(TARGETS.map((t) => t.build))
    for (const script of scripts) {
        // 整条命令一个字符串：shell:true 下传 args 数组会被 Node 判为拼接注入风险（DEP0190）
        const r = spawnSync(`pnpm ${script}`, { cwd: ROOT, stdio: "ignore", shell: true })
        if (r.status !== 0) fail(`${script} 失败（退出码 ${r.status}）`)
    }
}

function main() {
    const opts = parseArgs(process.argv.slice(2))
    if (opts.help) {
        console.log(
            `用法：node scripts/perf-bundle.mjs [--no-build] [--baseline] [--check] [--budget N] [--no-history]\n\n` +
                `  （默认）        构建 ${[...new Set(TARGETS.map((t) => t.build))].join(" / ")} 再逐个 dist 量 gzip\n` +
                `  --no-build     复用已有产物，秒级\n` +
                `  --baseline     把本轮冻成 perf/bundle-baseline.json\n` +
                `  --check        门禁：与基线比，超预算退出码 1（默认预算 +${DEFAULT_BUDGET_PERCENT}%）\n` +
                `  --budget N     --check 的预算，单位百分比\n` +
                `  --no-history   不往 perf/bundle-history.jsonl 追加（CI 用，避免把仓库写脏）\n\n` +
                `目标清单硬编码在本文件顶部 TARGETS：${TARGETS.map((t) => t.name).join(" / ")}。\n` +
                `不加 --check 就是纯记录，不阻断。`,
        )
        return
    }
    if (opts.build) {
        console.log("[perf:bundle] 构建三端（--no-build 可跳过）…")
        buildTargets()
    }

    const results = {}
    const firstScreen = {}
    for (const target of TARGETS) {
        const dir = join(ROOT, target.dir)
        if (!existsSync(dir)) {
            fail(
                `${target.name} 没有构建产物（${target.dir} 不存在）。\n` +
                    `        去掉 --no-build 让它自己构建，或先跑 pnpm ${target.build}`,
            )
        }
        if (statSync(dir).mtimeMs < Date.now() - 30 * 24 * 3600 * 1000) {
            console.log(
                `[perf:bundle] 注意：${target.name} 的产物已经 30 天没重建过，数字可能不是当前代码的`,
            )
        }
        results[target.name] = measure(dir)
        const probe = FIRST_SCREEN[target.name]
        if (probe) {
            const screen = measureFirstScreen(dir, probe)
            // 探针缺失不该让整条命令失败（它不阻断、只记录），但要让人知道这轮没量到首屏
            firstScreen[target.name] = screen ?? { missing: true }
            if (!screen)
                console.log(
                    `[perf:bundle] 注意：${target.name} 首屏探针缺失（${probe}），本轮不记首屏`,
                )
        }
    }

    const ts = new Date().toISOString()
    const version = git(["rev-parse", "--short", "HEAD"])
    const dirty = git(["status", "--porcelain"]).length > 0
    const baseline = existsSync(BASELINE_FILE)
        ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
        : null

    console.log(
        `\n══ 产物体积 · ${version || "无 git sha"}${dirty ? " (工作区有改动)" : ""} · ${ts} ══`,
    )
    for (const target of TARGETS) {
        const { totals, chunks } = results[target.name]
        const base = baseline?.targets?.[target.name]
        const line = CATEGORIES.map(({ key }) => {
            const bucket = totals[key]
            if (!bucket) return ""
            return `${key.toUpperCase()} ${bucket.files} 个 · ${formatKb(bucket.gzip)}${delta(bucket.gzip, base?.totals?.[key]?.gzip)}`
        })
            .filter(Boolean)
            .join("   ")
        console.log(
            `\n${target.name.padEnd(11)} 合计 gzip ${formatKb(sumGzip(totals))}${delta(sumGzip(totals), base ? sumGzip(base.totals) : null)}`,
        )
        console.log(`            ${line}`)
        const fsScreen = firstScreen[target.name]
        if (fsScreen && !fsScreen.missing) {
            const baseFs = baseline?.firstScreen?.[target.name]?.gzip
            console.log(
                `            首屏 JS ${fsScreen.chunks} 个 chunk · ${formatKb(fsScreen.gzip)}${delta(fsScreen.gzip, baseFs)}` +
                    `   ← 决定 LCP 的那一部分，与上面的总量分开看`,
            )
        }
        const baseChunks = base?.chunks ?? {}
        for (const chunk of topChunks(chunks, 5)) {
            console.log(
                `            ${formatKb(chunk.gzip).padStart(7)}  ${chunk.name}${chunk.files > 1 ? ` (${chunk.files} 个同名)` : ""}${delta(chunk.gzip, baseChunks[chunk.name]?.gzip)}`,
            )
        }
    }

    if (opts.baseline) {
        const next = {
            schema: 1,
            ts,
            version,
            targets: Object.fromEntries(
                TARGETS.map((t) => [
                    t.name,
                    {
                        totals: Object.fromEntries(
                            Object.entries(results[t.name].totals).map(([k, v]) => [
                                k,
                                { files: v.files, gzip: v.gzip },
                            ]),
                        ),
                        chunks: Object.fromEntries(
                            topChunks(results[t.name].chunks, 20).map((c) => [
                                c.name,
                                { gzip: c.gzip },
                            ]),
                        ),
                    },
                ]),
            ),
            firstScreen: Object.fromEntries(
                Object.entries(firstScreen)
                    .filter(([, screen]) => !screen.missing)
                    .map(([name, screen]) => [name, { gzip: screen.gzip }]),
            ),
        }
        writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 4)}\n`)
        console.log("\n[perf:bundle] 本轮已冻成基线：perf/bundle-baseline.json")
    }

    // 门禁：只有显式 --check 才判。放在打印之后，这样红了的时候上面的差值表就在眼前
    if (opts.check) {
        // 先确认「比得成」，再比。缺基线 / 缺测量项一律红——见 checkPrerequisites 的注释：
        // 门禁放过「量不到」，等于让坏掉的探针和误删的基线伪装成绿色 CI。
        const problems = checkPrerequisites(baseline, results, firstScreen)
        if (problems.length > 0) {
            console.error(`\n[perf:bundle] --check 无法判定（${problems.length} 项量不到）：`)
            for (const problem of problems) console.error(`  ✗ ${problem}`)
            console.error(
                `\n  这些是「量不到」，不是「没超标」——所以按失败处理。\n` +
                    `  基线缺项：pnpm perf:bundle -- --baseline（重新冻，注意这会把当前体积写进基线）\n` +
                    `  产物为空：先构建，三端是 pnpm build:web / build:seller / build:admin`,
            )
            process.exitCode = 1
        } else {
            const violations = checkBudget(baseline, results, firstScreen, opts.budget)
            if (violations.length > 0) {
                console.error(
                    `\n[perf:bundle] 体积超出预算（基线 ${baseline.version || "?"} / ${baseline.ts}，预算 +${opts.budget}%）：`,
                )
                for (const violation of violations) console.error(`  ✗ ${violation}`)
                console.error(
                    `\n  变大是有意的（新功能、新依赖）就在同一个 PR 里重冻基线：\n` +
                        `      pnpm perf:bundle -- --baseline\n` +
                        `  重冻等于把「涨了」写进基线，所以请在 PR 描述里说明为什么涨、涨得值不值。\n` +
                        `  变大是无意的——看上面差值表里涨最多的是哪个 chunk，再用 pnpm perf:attrib 定位到源文件。`,
                )
                process.exitCode = 1
            } else {
                console.log(
                    `\n[perf:bundle] --check 通过：全部在 +${opts.budget}% 预算内（基线 ${baseline.version || "?"} / ${baseline.ts}）。`,
                )
            }
        }
    }

    const record = {
        ts,
        version,
        dirty,
        totals: Object.fromEntries(
            TARGETS.map((t) => [
                t.name,
                Object.fromEntries(
                    Object.entries(results[t.name].totals).map(([k, v]) => [k, v.gzip]),
                ),
            ]),
        ),
        firstScreen: Object.fromEntries(
            Object.entries(firstScreen)
                .filter(([, screen]) => !screen.missing)
                .map(([name, screen]) => [name, screen.gzip]),
        ),
    }
    if (!opts.noHistory) {
        writeFileSync(HISTORY_FILE, `${JSON.stringify(record)}\n`, { flag: "a" })
    }

    console.log(
        `\n── ${opts.check ? "本轮是门禁（--check）" : "不阻断（与 pnpm perf 同一口径）；要当门禁加 --check"}。\n` +
            `   首屏 JS 那行才是 LCP 的直接驱动量；总量涨了但首屏没涨，多半是懒加载的路由变胖了。\n` +
            `   看不见什么：剥掉 hash 后最大的几个仍叫 src.js / link.js，答不了「首屏里该拆谁」——那要 ` +
            `pnpm perf:attrib 的模块级归属。\n` +
            `   历史 perf/bundle-history.jsonl${baseline || opts.baseline ? "" : "；还没有基线：pnpm perf:bundle -- --baseline"}`,
    )
}

try {
    main()
} catch (error) {
    if (!(error instanceof BundleFailed)) console.error(error)
    process.exitCode = 1
}
