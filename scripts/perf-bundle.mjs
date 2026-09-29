#!/usr/bin/env node
/**
 * 产物体积测量：三端 dist 的 gzip 字节，按 target × 类型汇总，与 perf/bundle-baseline.json 比差值。
 *
 * 跑什么：构建 web / seller / admin → 逐个 dist 目录算 gzip 字节 → 按 (target, 类型) 汇总，
 *        再按去掉 hash 的 chunk 名排出最大的几个 → 落 perf/bundle-history.jsonl 并打印与基线的差。
 *
 * 为什么要它：Lighthouse 那份是**估算**且带机器噪声（同一份产物连跑三次，首页 LCP 实测
 *        5862 / 5863 / 6603ms）。产物体积是精确、零噪声、秒级可比的数字——它是「有人加了个
 *        3MB 依赖」这类回归最便宜的探测器，也是本项目在没有真实用户、没有 CI 门禁之前，
 *        唯一一个每次改动都能立刻相信的性能数字。
 *
 * 它看不见什么：chunk 名是 Rolldown autoCodeSplitting 生成的，最大的几个叫 src-*.js / link-*.js，
 *        **从名字看不出里面装了什么**。所以这份测量能回答「变大了没有、涨了哪一类」，
 *        回答不了「该拆谁」。后者要模块级归属，得先有 sourcemap（见 perf/README.md）。
 *
 * 是否阻断：不阻断，与 pnpm perf 同一口径。但它随时可以变成门禁——正因为没有噪声，阈值才有意义。
 *
 * 用法：
 *   pnpm perf:bundle                  # 构建三端再量（默认，保证量的是当前工作区）
 *   pnpm perf:bundle -- --no-build    # 复用已有 dist
 *   pnpm perf:bundle -- --baseline    # 把本轮冻成基线
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

function parseArgs(argv) {
    const opts = { build: true, baseline: false, help: false }
    for (const arg of argv) {
        if (arg === "--") continue
        else if (arg === "-h" || arg === "--help") opts.help = true
        else if (arg === "--no-build") opts.build = false
        else if (arg === "--baseline") opts.baseline = true
        else fail(`未知参数 ${arg}`)
    }
    return opts
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
            `用法：node scripts/perf-bundle.mjs [--no-build] [--baseline]\n\n` +
                `  （默认）      构建 ${[...new Set(TARGETS.map((t) => t.build))].join(" / ")} 再逐个 dist 量 gzip\n` +
                `  --no-build   复用已有产物，秒级\n` +
                `  --baseline   把本轮冻成 perf/bundle-baseline.json\n\n` +
                `目标清单硬编码在本文件顶部 TARGETS：${TARGETS.map((t) => t.name).join(" / ")}。\n` +
                `不阻断——这是记录，不是门禁。`,
        )
        return
    }
    if (opts.build) {
        console.log("[perf:bundle] 构建三端（--no-build 可跳过）…")
        buildTargets()
    }

    const results = {}
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
        }
        writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 4)}\n`)
        console.log("\n[perf:bundle] 本轮已冻成基线：perf/bundle-baseline.json")
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
    }
    writeFileSync(HISTORY_FILE, `${JSON.stringify(record)}\n`, { flag: "a" })

    console.log(
        `\n── 不阻断（与 pnpm perf 同一口径）。这一项没有测量噪声，所以将来要设门禁，先设它。\n` +
            `   看不见什么：剥掉 hash 后最大的几个仍叫 src.js / link.js，答不了「该拆谁」——那要模块级归属，见 perf/README.md。\n` +
            `   历史 perf/bundle-history.jsonl${baseline || opts.baseline ? "" : "；还没有基线：pnpm perf:bundle -- --baseline"}`,
    )
}

try {
    main()
} catch (error) {
    if (!(error instanceof BundleFailed)) console.error(error)
    process.exitCode = 1
}
