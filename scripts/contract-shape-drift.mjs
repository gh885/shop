#!/usr/bin/env node
/**
 * 契约形状漂移门禁（`pnpm types:drift`，接进 lefthook pre-push 与 CI）。
 *
 * 抓什么：**业务代码里手打的匿名对象形状，逐字等于契约里已有的类型**。
 * 例：`OrdersApi.createOrder({ body })` 的入参被手写成
 *   `{ checkoutKey: string; addressId: string; lines: OrderLineRequest[]; userCouponIds?: string[]; buyerMessage?: string }`
 * 而 `CreateOrderRequest` 一字不差就是这个形状 —— 该直接引契约类型，不重打。
 *
 * 为什么值得单列一条门禁：形状一旦有两个来源就必然漂移。后端给 `CreateOrderRequest`
 * 加一列，手打的那份**不会跟着变、也不报错**（多了字段不违反结构类型），
 * 症状是「新字段永远传不上去」这种只在联调时才浮出来的 bug。契约是唯一真相源，
 * 业务层只该引它，不该复述它。
 *
 * 判定口径（三条都踩过，别改）：
 *   1) **只报逐字同构**，不报子集。`{ id: string }` 是几十个契约类型的子集，报子集等于噪声门禁，
 *      没人会看。要抓的是「一个字不差地抄了一遍」。
 *   2) **必须归一 `Array<X>` → `X[]`**：生成器写 `Array<string>`，业务代码习惯写 `string[]`。
 *      不归一则真阳性**全部漏掉**（本条实测：归一前 0 命中，归一后 11 命中）。
 *   3) **值必须长得像类型**才认。否则对象字面量 `{ id: props.id, name: props.name }` 里
 *      的 `props.id` 会被当成类型参与比对。要求每个值是小写原始类型关键字、或以大写字母开头
 *      （`Money` / `Array<X>` / `X[]` / 联合），`props.id` 这类小写开头的属性访问一律不认。
 *
 * 扫描范围：`apps/*` 与 `packages/*` 的手写 ts/tsx。排除 `packages/api/src`（生成物）、
 * `*.gen.*`（生成物）、`components/reui`（第三方 vendored，README 明写「尽量不动」）、
 * `node_modules`。**含测试文件**——测试夹具手打契约形状同样是两个来源，2026-10 修过一处
 * （`use-captcha.test.tsx` 的 `{ captchaId, image }`）。
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const CONTRACT_FILE = join(ROOT, "packages/api/src/sdk/types.gen.ts")
const SCAN_ROOTS = ["apps", "packages"]
/** 原始类型关键字：小写也算「像类型」（`props.id` 这类属性访问不以它们开头） */
const PRIMITIVES = new Set([
    "string",
    "number",
    "boolean",
    "unknown",
    "any",
    "never",
    "null",
    "undefined",
    "void",
    "object",
    "bigint",
    "symbol",
])

/** 归一类型文本：`Array<X>` / `ReadonlyArray<X>` → `X[]`、去多余空格、统一引号 */
export function normalizeType(text) {
    return (
        text
            .replaceAll(/\s+/g, " ")
            .trim()
            .replaceAll('"', "'")
            // ReadonlyArray 必须排在 Array 前面：`Array<([^<>]+)>` 会把 `ReadonlyArray<X>` 里的
            // `Array<X>` 先吃掉，产出 `Readonlystring[]`（单测钉着这条）
            .replaceAll(/ReadonlyArray<([^<>]+)>/g, "$1[]")
            .replaceAll(/Array<([^<>]+)>/g, "$1[]")
    )
}

/** 值看起来像类型吗（用于排除对象字面量） */
function looksLikeType(value) {
    const v = value.replace(/\[\]$/, "").trim()
    if (PRIMITIVES.has(v)) return true
    if (/^[A-Z]/.test(v)) return true
    if (/^Array<.+>$/.test(value.trim())) return true
    // 联合/交叉：每一支都得像类型
    const parts = value.split(/\s*[|&]\s*/).filter(Boolean)
    return parts.length > 1 && parts.every((p) => looksLikeType(p))
}

/**
 * 解析一个 `{ ... }` 体，返回字段签名（排序后 join）。不是纯类型字面量则返回 null。
 * 本项目格式是一行一个字段，所以按换行/分号切即可。
 */
export function parseTypeBody(body) {
    if (body.includes("(") || body.includes("=>")) return null
    const fields = []
    for (const raw of body.split(/[\n;]/)) {
        const line = raw.trim()
        if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*"))
            continue
        const m = line.match(/^(?:readonly )?([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/)
        if (!m) return null
        const value = m[3].trim()
        if (!looksLikeType(value)) return null
        fields.push(`${m[1]}${m[2] ?? ""}:${normalizeType(value)}`)
    }
    if (fields.length < 2) return null
    return [...fields].toSorted().join(" | ")
}

/** 从 types.gen.ts 抽契约对象类型：签名 → 类型名（同签名取先出现的那个） */
export function extractContractTypes(source) {
    const map = new Map()
    const lines = source.split("\n")
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^export type ([A-Za-z_][A-Za-z0-9_]*) = \{$/)
        if (!m) continue
        const buf = []
        let j = i + 1
        while (j < lines.length && !/^\};?\s*$/.test(lines[j])) {
            buf.push(lines[j])
            j++
        }
        const sig = parseTypeBody(buf.join("\n"))
        if (sig && !map.has(sig)) map.set(sig, m[1])
    }
    return map
}

/** 扫一份源码里的所有 `{ ... }` 类型字面量，返回 [{ line, sig }] */
export function extractInlineShapes(source) {
    const found = []
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== "{") continue
        let depth = 0
        let end = -1
        for (let j = i; j < source.length; j++) {
            if (source[j] === "{") depth++
            else if (source[j] === "}") {
                depth--
                if (depth === 0) {
                    end = j
                    break
                }
            }
        }
        if (end < 0) continue
        const body = source.slice(i + 1, end)
        if (body.length > 900) continue
        const sig = parseTypeBody(body)
        if (sig) found.push({ line: source.slice(0, i).split("\n").length, sig })
    }
    return found
}

/** 该路径要不要扫（纯判定，便于单测） */
export function isScannable(relPath) {
    const p = relPath.split(sep).join("/")
    if (!/\.(ts|tsx)$/.test(p)) return false
    if (p.includes("node_modules")) return false
    if (p.startsWith("packages/api/src/")) return false
    if (p.includes("/components/reui/")) return false
    if (/\.gen\./.test(p)) return false
    return true
}

/** 找出某份源码里所有「手打形状 = 契约类型」的位置 */
export function findViolations({ path, source, contractTypes }) {
    const hits = []
    for (const { line, sig } of extractInlineShapes(source)) {
        const contractType = contractTypes.get(sig)
        if (contractType) hits.push({ path, line, contractType, sig })
    }
    return hits
}

function walk(dir, out = []) {
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return out
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "dist") continue
            walk(full, out)
        } else if (entry.isFile()) {
            out.push(full)
        }
    }
    return out
}

function main() {
    const contractTypes = extractContractTypes(readFileSync(CONTRACT_FILE, "utf8"))
    if (contractTypes.size === 0) {
        // 「量不到」一律判失败：契约类型读不出来，说明生成物路径变了，静默通过就是假绿
        console.error(`types:drift 失败：没从 ${relative(ROOT, CONTRACT_FILE)} 解析出任何契约类型`)
        process.exit(1)
    }

    const files = SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root)))
    const violations = []
    let scanned = 0
    for (const file of files) {
        const rel = relative(ROOT, file)
        if (!isScannable(rel)) continue
        let stat
        try {
            stat = statSync(file)
        } catch {
            continue
        }
        if (!stat.isFile()) continue
        scanned++
        violations.push(
            ...findViolations({
                path: rel.split(sep).join("/"),
                source: readFileSync(file, "utf8"),
                contractTypes,
            }),
        )
    }

    if (violations.length === 0) {
        console.log(`✓ 无手打契约形状（扫了 ${scanned} 个文件，契约类型 ${contractTypes.size} 个）`)
        return
    }

    console.error(`✗ 发现 ${violations.length} 处手打形状，直接引契约类型即可：\n`)
    for (const v of violations.toSorted((a, b) => a.path.localeCompare(b.path))) {
        console.error(`  ${v.path}:${v.line}`)
        console.error(`      手打形状 == 契约类型 ${v.contractType}`)
    }
    console.error(`\n改法：把该处的内联形状换成上面那个契约类型（从 "@shop/api/sdk" 导入）。`)
    console.error(`理由：形状有两个来源就会漂移——契约加字段时手打那份不报错、只是静默传不上去。`)
    process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
