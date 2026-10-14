#!/usr/bin/env node
/**
 * 层叠带门禁（`pnpm z-index:guard`，接进 lefthook pre-commit）。
 *
 * 抓什么：**业务代码（`apps/<app>/src` 下）里自造的全局层叠数值**。
 * 例：`className="fixed inset-0 z-50"`、`className="sticky top-0 z-[35]"`、
 * `style={{ zIndex: 9999 }}`。
 *
 * 为什么值得单列一条门禁：DESIGN.md §2.4 写着"业务侧不写 z-* 去抢弹窗"，但这句话
 * **一直没有牙**——`shadcn/no-arbitrary-values` 只拦 `z-[35]` 这种任意值，
 * `z-50` 是合法类名，随手就能写。2026-10 的浮层审查实测：全站浮层散在 24 处裸 `z-50`、
 * 吸顶有 `z-30`/`z-40` 两套口径，且 `z-50` 满街都是的后果是**层级只能靠挂载顺序决定**
 * （Toaster 首屏挂载 ⇒ 它的 portal 永远排在最前 ⇒ toast 被弹窗遮罩压住，见
 * docs/audits/overlay-layering-review-2026-10-13.md）。
 *
 * 判定口径（三条都踩过，别改）：
 *   1) **只认 ≥30 的裸数值**。30 以下是"组件内部相对层级"（卡片里的徽标 z-1、
 *      画廊箭头 z-10、表格滚动条 z-20），它们出不了自己那层，禁掉只会逼人写更绕的代码。
 *      30 及以上是**全局层叠带**，必须走 token。
 *   2) **允许五个 token utility**：`z-sticky` / `z-raised` / `z-chrome` / `z-overlay` /
 *      `z-toast`。业务侧需要"盖住别的东西"时，表达的是**意图**（我是吸顶 / 我是内容浮层 /
 *      我是壳层 / 我是浮层 / 我是通知），而不是一个数字。这五个名字是 `--z-index-*`
 *      （Tailwind v4 的官方 z-* 命名空间）生成的，改档位只改一处。
 *   3) **注释不算**。`// 吸顶头 z-40 是刻意的` 这种说明文字必须放行，否则门禁会逼人
 *      不敢写注释。所以扫描前先剥注释（见 `stripComments`）。
 *
 * 扫描范围：`apps/<app>/src` 下的 ts/tsx。**不含 packages/<pkg>**——ui-web 是设计系统的定义处，
 * 它当然要写 z-*；reui 是第三方 vendored，尽量不动。也不含测试文件（夹具里造浮层是常事）。
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { out as makeOut } from "../lib/out.mjs"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))

/** 全局层叠带的下界：>= 这个值就必须是 token utility，不能是裸数值 */
export const GLOBAL_BAND_MIN = 30

/** 允许在业务代码里出现的层叠 token utility（由 --z-index-* 生成） */
export const ALLOWED_UTILITIES = ["z-sticky", "z-raised", "z-chrome", "z-overlay", "z-toast"]

const SCAN_EXTENSIONS = [".ts", ".tsx"]

/**
 * 剥掉注释，避免"注释里提到 z-40"被判违规。
 *
 * 不是完整的词法分析器，只处理两类真实存在的形态：块注释（含 JSDoc）与 `//` 行注释。
 * 行注释要求前面不是 `:`，否则 `https://…` 里的 `//` 会把
 * 整行后半截吃掉（类名跟在 URL 后面时就会静默漏检）。
 */
export function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

/** 扫描目标：业务侧 ts/tsx，排除测试 */
export function isScannable(relPath) {
    const normalized = relPath.split(sep).join("/")
    if (!SCAN_EXTENSIONS.some((ext) => normalized.endsWith(ext))) return false
    if (/\.(test|spec)\./.test(normalized)) return false
    return true
}

/**
 * 判定一行里的违规。返回 `{ raw, reason }` 数组（一行可能多处）。
 *
 * 三类形态各一条正则：
 *   - `z-<n>`（n >= 30）—— 裸数值类名。`-z-10` 会命中 `z-10`（10 < 30）→ 放行。
 *   - `z-[…]` —— 任意值类名，数值不可见，直接禁。
 *   - `zIndex: <n>`（n >= 30）—— 内联样式里的等价写法。
 */
export function findOffendersInLine(line) {
    const offenders = []

    for (const match of line.matchAll(/(?<![a-zA-Z0-9_])z-(\d+)/g)) {
        const value = Number(match[1])
        if (value >= GLOBAL_BAND_MIN) {
            offenders.push({
                raw: match[0],
                reason: `裸数值层叠 ${match[0]}：>= ${GLOBAL_BAND_MIN} 属于全局层叠带，请改用 ${ALLOWED_UTILITIES.join(" / ")}`,
            })
        }
    }

    for (const match of line.matchAll(/(?<![a-zA-Z0-9_])z-\[[^\]]*\]/g)) {
        offenders.push({
            raw: match[0],
            reason: `任意值层叠 ${match[0]}：数值不可见、无法统一调档，请改用 ${ALLOWED_UTILITIES.join(" / ")}`,
        })
    }

    for (const match of line.matchAll(/zIndex\s*:\s*(\d+)/g)) {
        const value = Number(match[1])
        if (value >= GLOBAL_BAND_MIN) {
            offenders.push({
                raw: match[0],
                reason: `内联样式 zIndex: ${value}：>= ${GLOBAL_BAND_MIN} 属于全局层叠带，请改用 ${ALLOWED_UTILITIES.join(" / ")}`,
            })
        }
    }

    return offenders
}

/** 扫一份源码，返回 `{ line, column, raw, reason }[]` */
export function findViolations(relPath, source) {
    if (!isScannable(relPath)) return []

    const violations = []
    const lines = stripComments(source).split("\n")
    for (const [index, line] of lines.entries()) {
        for (const offender of findOffendersInLine(line)) {
            violations.push({
                line: index + 1,
                column: line.indexOf(offender.raw) + 1,
                raw: offender.raw,
                reason: offender.reason,
            })
        }
    }
    return violations
}

/** 递归列出目录下的待扫文件（相对 ROOT，posix 分隔） */
function listFiles(dir) {
    const found = []
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return found
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "dist") continue
            found.push(...listFiles(full))
        } else if (entry.isFile()) {
            found.push(relative(ROOT, full).split(sep).join("/"))
        }
    }
    return found
}

function scanWorkspace() {
    const results = []
    let appsDir
    try {
        appsDir = readdirSync(join(ROOT, "apps"), { withFileTypes: true })
    } catch {
        return results
    }
    for (const app of appsDir) {
        if (!app.isDirectory()) continue
        for (const relPath of listFiles(join(ROOT, "apps", app.name, "src"))) {
            if (!isScannable(relPath)) continue
            const violations = findViolations(relPath, readFileSync(join(ROOT, relPath), "utf8"))
            if (violations.length > 0) results.push({ relPath, violations })
        }
    }
    return results
}

function main() {
    const o = makeOut("z-index:guard")
    const results = scanWorkspace()
    const total = results.reduce((sum, file) => sum + file.violations.length, 0)

    if (total === 0) {
        o.ok("业务侧没有裸数值层叠")
        return
    }

    o.err(`发现 ${total} 处裸数值层叠`)
    for (const { relPath, violations } of results) {
        for (const violation of violations) {
            o.rawErr(`  ${relPath}:${violation.line}:${violation.column}  ${violation.reason}`)
        }
    }
    o.rawErr(
        `\n档位表见 packages/ui-web/DESIGN.md §2.4；` +
            `浮层之间刻意不分档（同住 z-overlay，先后由 portal 挂载顺序决定）。`,
    )
    process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
