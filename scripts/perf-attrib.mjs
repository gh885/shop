#!/usr/bin/env node
// scripts/perf-attrib.mjs —— 首屏产物的模块级字节归属（回答「首屏里该拆谁」）
//
// 为什么需要它：perf-bundle 量到 chunk 一级就停了——Rolldown autoCodeSplitting 按目录和首个符号
// 命名，最大的几个叫 src.js / link.js，名字不携带内容信息（见 perf/README「它看不见什么」）。
// 三端构建都开了 build.sourcemap: "hidden"，所以 .map 与产物同目录，把 mappings 解出来就能把
// 生成代码的字节归回源文件。
//
// 口径：与 perf-bundle 的首屏闭包一致（HTML 入口 + 静态 import 闭包，不追动态 import）。
// 字节是**生成代码的 raw 长度**，gzip 是按占比折算的估计值——精确 gzip 只能整块量，
// 归因到单文件必然带误差。它的用途是排序与占比，不是当绝对数。
//
// 用法：
//   node scripts/perf-attrib.mjs                     # 三端首屏，各自 top 20
//   node scripts/perf-attrib.mjs web --group         # 按包/目录聚合
//   node scripts/perf-attrib.mjs admin --top 40
//   node scripts/perf-attrib.mjs web --no-first-screen # 整个 dist 而不只是首屏闭包

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { gzipSync } from "node:zlib"
import { spawnSync } from "node:child_process"

const ROOT = dirname(import.meta.dirname)

const TARGETS = {
    "web/client": { dir: "apps/web/dist/client", probe: "welcome/index.html" },
    seller: { dir: "apps/seller/dist", probe: "index.html" },
    admin: { dir: "apps/admin/dist", probe: "index.html" },
}

// ── VLQ ────────────────────────────────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const B64_LOOKUP = new Int8Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i

/** 解一段 VLQ（sourcemap 的差值整数编码），返回 { value, next } */
function decodeVlq(str, start) {
    let result = 0
    let shift = 0
    let i = start
    let continuation = true
    while (continuation) {
        const digit = B64_LOOKUP[str.charCodeAt(i)]
        // 非 base64 字符（含码位 ≥128 时 typed array 越界读出的 undefined）都落到这条
        if (!(digit >= 0)) throw new Error(`bad VLQ char at ${i}`)
        i++
        continuation = (digit & 32) !== 0
        result += (digit & 31) << shift
        shift += 5
    }
    const negative = (result & 1) === 1
    result >>= 1
    return { value: negative ? (result === 0 ? -0x80000000 : -result) : result, next: i }
}

/**
 * 解 mappings，产出每个生成行上的段列表：[{ genCol, source }]。
 * 支持顶层 sections（Rolldown 的分桶产物可能是 sectioned map）。
 *
 * 规范：`;` 分隔生成行、`,` 分隔段，段内是**相对前一个段**的 VLQ 差值——genCol 在行内累加，
 * sourceIndex / sourceLine / sourceCol 跨行累加。
 */
function parseMappings(mapText) {
    const map = JSON.parse(mapText)
    const sections = map.sections ?? [{ map, offset: { line: 0, column: 0 } }]
    /** @type {Map<number, {genCol: number, source: string}[]>} */
    const lines = new Map()

    for (const section of sections) {
        const inner = section.map
        const sources = inner.sources ?? []
        const offsets = section.offset ?? { line: 0, column: 0 }
        let genLine = offsets.line
        let sourceIndex = 0
        let sourceLine = 0
        let sourceCol = 0

        const rawLines = (inner.mappings ?? "").split(";")
        for (let li = 0; li < rawLines.length; li++) {
            let genCol = li === 0 ? offsets.column : 0
            for (const segment of rawLines[li].split(",")) {
                if (segment === "") continue
                let pos = 0
                const read = () => {
                    const out = decodeVlq(segment, pos)
                    pos = out.next
                    return out.value
                }
                genCol += read()
                let source = null
                if (pos < segment.length) {
                    sourceIndex += read()
                    if (sourceIndex >= 0 && sourceIndex < sources.length)
                        source = sources[sourceIndex]
                }
                if (pos < segment.length) sourceLine += read()
                if (pos < segment.length) sourceCol += read()
                if (source) {
                    const arr = lines.get(genLine) ?? []
                    arr.push({ genCol, source })
                    lines.set(genLine, arr)
                }
            }
            genLine++
        }
    }
    for (const arr of lines.values()) arr.sort((a, b) => a.genCol - b.genCol)
    return lines
}

/** 把一个 chunk 的生成字节归到源文件 */
function attributeChunk(code, mapText) {
    const lines = parseMappings(mapText)
    const perSource = new Map()
    const codeLines = code.split("\n")
    for (let li = 0; li < codeLines.length; li++) {
        const line = codeLines[li]
        const segs = lines.get(li)
        if (!segs || segs.length === 0) {
            // 无映射的行（chunk 包装、banner 注释）算进一个桶，不摊给业务源文件
            perSource.set(
                "(unmapped)",
                (perSource.get("(unmapped)") ?? 0) + Buffer.byteLength(line) + 1,
            )
            continue
        }
        for (let si = 0; si < segs.length; si++) {
            const start = segs[si].genCol
            const end = si + 1 < segs.length ? segs[si + 1].genCol : line.length
            const bytes = Math.max(0, end - start) + 1 // +1 换行
            if (bytes <= 0) continue
            perSource.set(segs[si].source, (perSource.get(segs[si].source) ?? 0) + bytes)
        }
    }
    return perSource
}

// ── 首屏闭包（与 perf-bundle.mjs 的 FIRST_SCREEN 同一口径）──────────────────────
/**
 * @returns {{chunks: Set<string>, entries: Set<string>, children: Map<string, Set<string>>} | null}
 *   children 记下每个 chunk 的**静态**出边，`--why` 靠它把入口到目标 chunk 的路径串出来。
 */
function firstScreenChunks(dir, probe) {
    const htmlFile = join(dir, probe)
    if (!existsSync(htmlFile)) return null
    const html = readFileSync(htmlFile, "utf8")
    const assetsDir = join(dir, "assets")
    const refs = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1])
    const entries = new Set(refs)
    const children = new Map()
    const queue = [...refs]
    const seen = new Set()
    while (queue.length > 0) {
        const name = queue.pop()
        if (seen.has(name)) continue
        seen.add(name)
        const file = join(assetsDir, name)
        if (!existsSync(file)) continue
        const code = readFileSync(file, "utf8")
        // 只认同目录的**静态**兄弟引用：`import("./x.js")` 里 import 与引号之间隔着括号，故不进闭包。
        const outs = new Set()
        for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
            outs.add(m[1])
            if (!seen.has(m[1])) queue.push(m[1])
        }
        children.set(name, outs)
    }
    return { chunks: seen, entries, children }
}

/** 剥掉 content hash，让同一 chunk 前后两轮认得出来（与 perf-bundle 同一处理） */
function stripHash(name) {
    return name.replace(/-[A-Za-z0-9_-]{6,10}\.js$/, ".js")
}

/**
 * --why：从入口沿静态出边 BFS，找出把某个源文件带进首屏的 chunk 链路。
 * 回答的是「它凭什么在首屏」——归属告诉你谁胖，这个告诉你该拆哪一条边。
 */
function whyPath(closure, dir, pattern) {
    const { entries, children } = closure
    const assetsDir = join(dir, "assets")
    const hit = new Set()
    for (const name of closure.chunks) {
        const mapFile = join(assetsDir, `${name}.map`)
        if (!existsSync(mapFile)) continue
        const sources = JSON.parse(readFileSync(mapFile, "utf8")).sources ?? []
        if (sources.some((s) => s.includes(pattern))) hit.add(name)
    }
    if (hit.size === 0) return { hit, path: null, entries }

    const prev = new Map()
    const queue = [...entries]
    const visited = new Set(entries)
    let target = null
    while (queue.length > 0) {
        const name = queue.shift()
        if (hit.has(name) && !entries.has(name)) {
            target = name
            break
        }
        for (const child of children.get(name) ?? []) {
            if (visited.has(child)) continue
            visited.add(child)
            prev.set(child, name)
            queue.push(child)
        }
    }
    if (!target) {
        // 目标就在入口 chunk 自己身上——没有边可拆，是入口的静态 import 直接含它
        const entryHit = [...hit].filter((h) => entries.has(h))
        return { hit, path: entryHit.length > 0 ? entryHit : null, entries }
    }
    const path = [target]
    for (let cur = target; prev.has(cur); cur = prev.get(cur)) path.unshift(prev.get(cur))
    return { hit, path, entries }
}

function allJsChunks(dir) {
    const assetsDir = join(dir, "assets")
    if (!existsSync(assetsDir)) return new Set()
    return new Set(readdirSync(assetsDir).filter((f) => f.endsWith(".js")))
}

/** 归一化源路径：去掉 ../../ 前缀与 node_modules/.pnpm/<pkg>@<ver>…/node_modules/ 噪声 */
function normalizeSource(src) {
    let s = src.replace(/^\.\.(\/\.\.)+/, "").replace(/^\/+/, "")
    s = s.replace(/^(node_modules\/\.pnpm\/[^/]+\/node_modules\/)/, "npm:")
    s = s.replace(/^npm\//, "")
    return s
}

/** 聚合桶：按包/目录看占比 */
function bucketOf(src) {
    const s = normalizeSource(src)
    if (s.startsWith("(unmapped)")) return "（未映射：chunk 包装/入口壳）"
    if (s.includes("packages/api/src/sdk/zod.gen")) return "@shop/api · zod.gen（契约 schema）"
    if (s.includes("packages/api/src/sdk/sdk.gen")) return "@shop/api · sdk.gen（调用对象）"
    if (s.includes("packages/api/src/sdk/types.gen")) return "@shop/api · types.gen"
    if (s.includes("packages/api/src/sdk/core") || s.includes("packages/api/src/sdk/client"))
        return "@shop/api · 传输与序列化 core"
    if (s.startsWith("packages/api")) return "@shop/api · 其它"
    if (s.startsWith("packages/common")) return "@shop/common"
    if (s.startsWith("packages/ui-web")) return "@shop/ui-web"
    if (s.startsWith("packages/app-kit")) return "@shop/app-kit"
    const npmZod = s.match(/^npm:zod(@[^/]*)?\//)
    if (npmZod) return "zod 运行时（npm）"
    if (s.startsWith("npm:react")) return "react / react-dom（npm）"
    if (s.startsWith("npm:@tanstack")) return "tanstack（npm）"
    if (s.startsWith("npm:")) return "其它 npm"
    const app = s.match(/^apps\/(\w+)/)
    if (app) return `apps/${app[1]}`
    return "其它"
}

function humanKb(bytes) {
    return `${(bytes / 1024).toFixed(1)}KB`
}

function buildAll() {
    console.log("[perf:attrib] 构建三端（先要有产物；已构建过就很快）…")
    for (const script of ["build:web", "build:seller", "build:admin"]) {
        const r = spawnSync("pnpm", ["run", script], { cwd: ROOT, stdio: "inherit" })
        if (r.status !== 0) {
            console.error(`[perf:attrib] ${script} 失败`)
            process.exit(1)
        }
    }
}

function main() {
    const argv = process.argv.slice(2)
    const flags = new Set(argv.filter((a) => a.startsWith("--")))
    const topIdx = argv.indexOf("--top")
    const top = topIdx >= 0 ? Number(argv[topIdx + 1]) : 20
    const whyIdx = argv.indexOf("--why")
    const why = whyIdx >= 0 ? argv[whyIdx + 1] : null
    const which = argv.find((a) => !a.startsWith("--"))
    const group = flags.has("--group")
    const whole = flags.has("--no-first-screen")

    if (flags.has("--build")) buildAll()

    const keys = which ? [which] : Object.keys(TARGETS)
    for (const key of keys) {
        const target = TARGETS[key]
        if (!target) {
            console.error(
                `[perf:attrib] 未知目标 ${key}（可选：${Object.keys(TARGETS).join(" / ")}）`,
            )
            process.exit(1)
        }
        const dir = join(ROOT, target.dir)
        if (!existsSync(dir)) {
            console.log(`\n══ ${key}：没有产物（${target.dir}）。跑 pnpm build 或加 --build`)
            continue
        }
        const closure = whole ? null : firstScreenChunks(dir, target.probe)
        const chunks = closure ? closure.chunks : allJsChunks(dir)
        if (chunks.size === 0) {
            console.log(
                `\n══ ${key}：首屏闭包量不到（缺 ${target.probe}），加 --no-first-screen 量整个 dist`,
            )
            continue
        }

        if (why) {
            if (!closure) {
                console.log(`\n══ ${key}：--why 只对首屏闭包有意义（去掉 --no-first-screen）`)
                continue
            }
            const { hit, path, entries } = whyPath(closure, dir, why)
            console.log(`\n══ ${key} · 谁把「${why}」带进首屏`)
            if (hit.size === 0) {
                console.log("   含它的 chunk：（首屏闭包里没有——它已经不在首屏了）")
                continue
            }
            console.log(`   含它的 chunk：${[...hit].map(stripHash).join(", ")}`)
            console.log(`   HTML 入口：${[...entries].map(stripHash).join(", ")}`)
            if (path) {
                const asEntry = path.every((p) => entries.has(p))
                console.log(
                    `   链路：${path.map(stripHash).join("  →  ")}${asEntry ? "   ← 入口自己静态 import 的，要拆得改入口" : ""}`,
                )
            } else {
                console.log("   链路：（闭包里走不到——多半是被别的 chunk 动态引用，不在首屏）")
            }
            continue
        }

        const perSource = new Map()
        const perBucket = new Map()
        let totalRaw = 0
        let totalGzip = 0
        let missingMaps = 0
        const assetsDir = join(dir, "assets")

        for (const name of chunks) {
            const file = join(assetsDir, name)
            if (!existsSync(file)) continue
            const code = readFileSync(file)
            totalGzip += gzipSync(code).length
            const mapFile = `${file}.map`
            if (!existsSync(mapFile)) {
                missingMaps++
                perSource.set(
                    "(无 sourcemap)",
                    (perSource.get("(无 sourcemap)") ?? 0) + code.length,
                )
                continue
            }
            let per
            try {
                per = attributeChunk(code.toString("utf8"), readFileSync(mapFile, "utf8"))
            } catch (error) {
                console.error(`[perf:attrib] ${name} 解析失败：${error.message}`)
                continue
            }
            for (const [src, bytes] of per) {
                const norm = normalizeSource(src)
                perSource.set(norm, (perSource.get(norm) ?? 0) + bytes)
                const b = bucketOf(src)
                perBucket.set(b, (perBucket.get(b) ?? 0) + bytes)
                totalRaw += bytes
            }
        }

        const scale = totalRaw > 0 ? totalGzip / totalRaw : 1
        console.log(
            `\n══ ${key} · ${whole ? "整个 dist" : "首屏闭包"} · ${chunks.size} 个 chunk · 实际 gzip ${humanKb(totalGzip)}（归属覆盖 ${humanKb(totalRaw * scale)}）${missingMaps ? ` · ${missingMaps} 个 chunk 无 map` : ""}`,
        )

        const rows = group ? perBucket : perSource
        const sorted = [...rows.entries()].toSorted((a, b) => b[1] - a[1])
        const shown = group ? sorted : sorted.slice(0, top)
        for (const [label, bytes] of shown) {
            const est = bytes * scale
            console.log(
                `  ${humanKb(est).padStart(9)}  ${(100 * est) / totalGzip}%  ${basename(label) === label ? label : label.replace(/^.*?(packages|apps|npm)\//, "$1/")}  ${group ? "" : ""}`,
            )
        }
        if (!group && sorted.length > shown.length) {
            const rest = sorted.slice(top).reduce((a, [, b]) => a + b * scale, 0)
            console.log(
                `  ${humanKb(rest).padStart(9)}  ${(100 * rest) / totalGzip}%  （其余 ${sorted.length - top} 个源文件）`,
            )
        }
    }
    console.log(
        `\n── 字节是生成代码 raw 长度，gzip 按占比折算（估计）。用来看排序与占比，别当绝对数。`,
    )
}

main()
