#!/usr/bin/env node
/**
 * 设计 token 门禁（`pnpm token:guard`，接 pre-commit + CI）。
 *
 * 抓什么：三条**只写在注释里、一直没牙**的纪律（`packages/ui-web/DESIGN.md` §2.1 / §2.2）。
 *
 *   1) **裸用 Layer 1 色阶**。`className="bg-neutral-500"` 这种。
 *      我们的 primitive 叫 `--neutral-500`（**没有** `--color-` 前缀），Tailwind 内置色板叫
 *      `--color-neutral-500`——两者值不同却同形，于是 `bg-neutral-500` 是**合法类名**：
 *      页面看着正常、颜色是别人的，`shadcn/no-raw-colors` 也拦不住（它拦的是 `bg-[#f00]` 这类）。
 *      合法用法只有一种：语义层/端级主题用 `var(--neutral-500)` 引用。
 *
 *   2) **死 primitive**。`:root` 里声明了、全仓没有任何 `var(--…)` 引用。
 *      2026-10 实测：51 个 primitive 里 26 个零引用，已按本条门禁删净（neutral 4 / orange 5 /
 *      indigo 9 / 反馈 8），剩 25 个。
 *      它们照样写进每个页面的 CSS，更坏的是让下一个改 token 的人以为 `orange-500` 是可用的档。
 *
 *   3) **死语义色**。`@theme` 里声明了 `--color-*`、全仓没有消费者（既没有 `var(--color-x)`，
 *      也没有任何 `bg-x` / `text-x` / `ring-x` 一类的类名）。反方向——**类名在、token 不在**
 *      ——才是历史上真出过事的那半边（`bg-focus` 静默空转，见 `components/reui/README.md`），
 *      但那个方向要跟 Tailwind 内置色板逐名比对，误报靠 allowlist 养，先不开。
 *
 * 判定口径（踩过的坑都记在这儿，别改）：
 *   - **注释不算**。注释里写 `bg-orange-300 会命中 Tailwind 默认色板` 是**在解释**这条规则，
 *     必须放行，否则门禁会逼人不敢写注释（与 z-index-guard 同一条）。
 *   - **`--color-amber-500` 不算**。那是 Tailwind 内置色板的名字，不是我们的 primitive
 *     （我们叫 `--amber-500`）。vendored 的 reui 里有两处这么写（`data-grid-table.tsx`），
 *     是同一族的坑但改它要走 `components/reui/README.md` 的流程，所以**规则 1 扫不到它**——
 *     这是已知缺口，不是疏忽。
 *   - **vendored 目录整体不扫**（`components/reui/`）：那里是第三方积木，改它要有理由、
 *     要能重装。已知它里面有 `bg-blue-50!` / `bg-amber-500/5` 这类 Tailwind 默认色（3 处），
 *     等真要动 reui 时一并处理。
 *   - **生成物不扫**（`*.gen.*`、`sdk` 目录）：报一个没人能改的红，等于教人绕过门禁。
 *
 * 扫描范围：`apps/<app>/src` 与 `packages/<pkg>/src` 下的 ts/tsx/css，不含测试。
 * 判定是纯函数（有单测：`scripts/token-guard.test.mjs`），走盘部分只负责喂文件与打印。
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../../", import.meta.url))

/** Layer 1 primitive 的色族（值住在 ui-web 的 `:root`，见 DESIGN.md §2.1） */
export const PRIMITIVE_FAMILIES = ["neutral", "orange", "indigo", "green", "amber", "blue", "red"]

/** 声明处：primitive 在 `:root`、语义色在 `@theme`，两者都只许在这一份文件里新增 */
export const THEME_FILE = "packages/ui-web/src/styles.css"

const SCAN_EXTENSIONS = [".ts", ".tsx", ".css"]

/** 第三方 vendored 积木：不扫（见文件头「已知缺口」） */
const VENDORED_PREFIXES = ["packages/ui-web/src/components/reui/"]

const GENERATED_MARKERS = ["/sdk/", ".gen."]

/**
 * 剥掉注释，避免"注释里提到 token"被判违规。
 *
 * 与 z-index-guard 的 stripComments 同一份实现（那边有更细的论证）。两处刻意不抽公共模块：
 * 两条门禁各自独立、谁都不该因为对方改了判定而被动变红，这点重复是买来的。
 */
export function stripComments(source) {
    // 逐字符换成空格、**换行留住**：行号与偏移都不能动。
    // 上一版照抄 z-index-guard 的「整段删掉」，于是多行块注释上方的声明行号整体上移——
    // 门禁报到别的行去，比不报还坏。token 门禁报的是「哪一行该删/resize」，行号就是产物。
    return source
        .replaceAll(/\/\*[\s\S]*?\*\//g, (comment) => comment.replaceAll(/[^\n]/g, " "))
        .replaceAll(
            /(^|[^:])(\/\/[^\n]*)/g,
            (_match, prefix, comment) => prefix + " ".repeat(comment.length),
        )
}

/**
 * 把**合法**的 primitive 出现形式擦成占位符，剩下的才可能是违规。
 *
 * 三种合法形式，顺序要紧：
 *   1. `var(--neutral-500)` —— 语义层/端级主题的引用。先擦，否则第 3 步擦不掉它前面那截。
 *   2. `--color-amber-500` —— Tailwind 内置色板的命名空间，**不是**我们的 primitive。
 *   3. `--orange-200:` —— 我们自己的声明。**只擦带冒号的**：`bg-(--orange-300)` 这种
 *      「显式引用色阶」不是声明，必须留着被判违规（业务侧只许用 Layer 2 语义 token）。
 *
 * 替换串不含换行，所以擦完行号仍然对得上（findBarePrimitiveUses 依赖这一点）。
 */
export function scrubAllowedForms(source) {
    const families = PRIMITIVE_FAMILIES.join("|")
    return source
        .replaceAll(/var\(\s*--[\w-]+/g, "varref")
        .replaceAll(/--color-[\w-]+/g, "builtincolor")
        .replaceAll(new RegExp(`--(?:${families})-\\d+(?=\\s*:)`, "g"), "decl")
}

/**
 * 规则 1：找裸用的 primitive（`bg-neutral-500` / `border-orange-300` / `fill-red-500` …）。
 * 前缀不限——判定只看"这个色阶名出现在了类名位置"，而不是穷举几十个 utility 前缀。
 */
export function findBarePrimitiveUses(relPath, source) {
    if (!isScannable(relPath)) return []

    const scrubbedLines = scrubAllowedForms(stripComments(source)).split("\n")
    const violations = []
    // 前面只排除**词字符**：`bg-neutral-500` 前面是 `-`（utility 前缀），必须命中。
    // 上一版把 `-` 一起排除掉，于是「裸写色阶」这一整条规则从来没抓到过任何东西——
    // 门禁一直是绿的假象（单测抓到的）。
    const pattern = new RegExp(`(?<![\\w])(?:${PRIMITIVE_FAMILIES.join("|")})-\\d+`, "g")

    for (const [index, line] of scrubbedLines.entries()) {
        for (const match of line.matchAll(pattern)) {
            violations.push({
                line: index + 1,
                column: match.index + 1,
                raw: match[0],
                rule: "bare-primitive",
                reason: `${match[0]}：Layer 1 色阶只能被语义层 var() 引用，业务侧写它命中的是 Tailwind 内置色板（值不同）`,
            })
        }
    }
    return violations
}

/** 取源码里第一个 `{` 到配对 `}` 之间的内容（token 块里没有嵌套花括号，朴素计数够用） */
function extractBlock(source, marker) {
    const start = source.indexOf(marker)
    if (start < 0) return { body: "", offset: 0 }
    const open = source.indexOf("{", start)
    if (open < 0) return { body: "", offset: 0 }
    let depth = 0
    for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++
        else if (source[i] === "}") {
            depth--
            if (depth === 0) return { body: source.slice(open + 1, i), offset: open + 1 }
        }
    }
    return { body: source.slice(open + 1), offset: open + 1 }
}

function toLineNumber(source, index) {
    return source.slice(0, index).split("\n").length
}

/** 声明处抽 `--name: value`（注释先剥掉，否则注释里提到的 token 会被当成声明） */
function collectDeclarations(source, marker, namePattern) {
    const stripped = stripComments(source)
    const { body, offset } = extractBlock(stripped, marker)
    const found = []
    for (const match of body.matchAll(new RegExp(`(${namePattern})\\s*:`, "g"))) {
        found.push({ name: match[1], line: toLineNumber(stripped, offset + match.index) })
    }
    return found
}

/** primitive 声明（`:root` 里 `--neutral-*` 一族） */
export function collectDeclaredPrimitives(themeSource) {
    return collectDeclarations(themeSource, ":root", `--(?:${PRIMITIVE_FAMILIES.join("|")})-\\d+`)
}

/** 语义色声明（`@theme` 里 `--color-*`） */
export function collectDeclaredColors(themeSource) {
    return collectDeclarations(themeSource, "@theme", "--color-[\\w-]+")
}

/** 统计 `var(--name)` 引用次数（引用处不限文件，端级主题引用 primitive 是合法的） */
export function countReferences(sourcesByName, names) {
    const counts = new Map(names.map((name) => [name, 0]))
    for (const source of sourcesByName.values()) {
        const scrubbed = stripComments(source)
        for (const name of names) {
            const pattern = new RegExp(`var\\(\\s*${name}(?![\\w-])`, "g")
            counts.set(name, counts.get(name) + (scrubbed.match(pattern)?.length ?? 0))
        }
    }
    return counts
}

/**
 * 规则 3 的消费者判定：`--color-x` 的消费者有两种形态——
 * `var(--color-x)`，或任何带 `-x` 结尾的类名（`bg-x` / `text-x` / `ring-x/50` / `from-x-hover`…）。
 * 只看"`-x` 后面不是词字符也不是连字符"，所以 `bg-primary-subtle` 不会算成 `primary` 的消费者。
 */
export function countColorConsumers(sourcesByName, names) {
    const counts = new Map(names.map((name) => [name, 0]))
    const stripped = [...sourcesByName.values()].map(stripComments).join("\n")
    for (const name of names) {
        const bare = name.replace(/^--color-/, "")
        const pattern = new RegExp(`(?:var\\(\\s*${name}(?![\\w-])|-${bare}(?![\\w-]))`, "g")
        counts.set(name, stripped.match(pattern)?.length ?? 0)
    }
    return counts
}

/** 规则 2：声明了却没人引用的 primitive */
export function findDeadPrimitives(declared, referenceCounts) {
    return declared
        .filter((token) => (referenceCounts.get(token.name) ?? 0) === 0)
        .map((token) => ({
            line: token.line,
            raw: token.name,
            rule: "dead-primitive",
            reason: `${token.name}：声明了但全仓零 var() 引用，删掉（要用再加回来）`,
        }))
}

/** 规则 3：声明了却没有消费者的语义色 */
export function findDeadColors(declared, consumerCounts) {
    return declared
        .filter((token) => (consumerCounts.get(token.name) ?? 0) === 0)
        .map((token) => ({
            line: token.line,
            raw: token.name,
            rule: "dead-color",
            reason: `${token.name}：声明了但全仓没有 bg-/text-/var() 一类的消费者`,
        }))
}

/** 扫描目标：仓库源码，排除测试 / vendored / 生成物 */
export function isScannable(relPath) {
    const normalized = relPath.split(sep).join("/")
    if (!SCAN_EXTENSIONS.some((ext) => normalized.endsWith(ext))) return false
    if (/\.(test|spec)\./.test(normalized)) return false
    if (VENDORED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false
    if (GENERATED_MARKERS.some((marker) => normalized.includes(marker))) return false
    return true
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

function listWorkspaceSources() {
    const found = []
    for (const group of ["apps", "packages"]) {
        let dirs
        try {
            dirs = readdirSync(join(ROOT, group), { withFileTypes: true })
        } catch {
            continue
        }
        for (const dir of dirs) {
            if (!dir.isDirectory()) continue
            found.push(...listFiles(join(ROOT, group, dir.name, "src")))
        }
    }
    return found.filter(isScannable)
}

function main() {
    const sources = new Map()
    for (const relPath of listWorkspaceSources()) {
        sources.set(relPath, readFileSync(join(ROOT, relPath), "utf8"))
    }
    // 声明处本身也在扫描范围内（它就是 apps/packages 下的一份 src），单独读一份给规则 2/3 用
    const themeSource = readFileSync(join(ROOT, THEME_FILE), "utf8")
    sources.set(THEME_FILE, themeSource)

    const primitives = collectDeclaredPrimitives(themeSource)
    const colors = collectDeclaredColors(themeSource)

    const report = []
    for (const [relPath, source] of sources) {
        const violations = findBarePrimitiveUses(relPath, source)
        if (violations.length > 0) report.push({ relPath, violations })
    }

    const deadPrimitives = findDeadPrimitives(
        primitives,
        countReferences(
            sources,
            primitives.map((token) => token.name),
        ),
    )
    if (deadPrimitives.length > 0) report.push({ relPath: THEME_FILE, violations: deadPrimitives })

    const deadColors = findDeadColors(
        colors,
        countColorConsumers(
            sources,
            colors.map((token) => token.name),
        ),
    )
    if (deadColors.length > 0) report.push({ relPath: THEME_FILE, violations: deadColors })

    const total = report.reduce((sum, file) => sum + file.violations.length, 0)
    if (total === 0) {
        console.log(
            `token-guard: OK（${primitives.length} 个 primitive / ${colors.length} 个语义色，无裸用、无死 token）`,
        )
        return
    }

    console.error(`token-guard: 发现 ${total} 处 token 违规\n`)
    for (const { relPath, violations } of report) {
        for (const violation of violations) {
            console.error(`  ${relPath}:${violation.line}  ${violation.reason}`)
        }
    }
    console.error(
        `\n口径见 packages/ui-web/DESIGN.md §2.1（分层：Layer 1 只许语义层 var() 引用）；` +
            `primitive 与语义色的用途登记在 §2.2。`,
    )
    process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()
