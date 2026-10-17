#!/usr/bin/env node
/**
 * 命令字面量漂移（`pnpm commands:drift`）：文档与脚本里写到的 `pnpm <name>` 必须真的能执行。
 *
 * ## 为什么需要它
 * 命令清单没有单一真相源：全仓 60+ 文件、约 350 处 `pnpm xxx` 字面量（其中文档约 180 处），
 * 每份文档都在复述。改名/删命令时靠人记必漏，而漏掉的那处**不会报错**——它只会在读者
 * 照抄时失败。2026-10-17 删 6 个转发壳时改了 5 个文件；`db:up` 若改名要动 14 个文件。
 * 这不是「文档写得多」，是**没有校验**。本门禁把「改名漏改」从静默变成必红。
 *
 * ## 判定：`pnpm <name>` 只有三种能跑通
 * 1. 根 `package.json` 的 scripts —— 本仓库命令的正规出口
 * 2. pnpm 自己的子命令（install / exec / dlx / view …）
 * 3. `node_modules/.bin` 里已安装的二进制（commitlint、playwright …，`pnpm <bin>` 会回退到它）
 * 三者之外一律判失败。**包括**「曾经存在但已删掉」的命令。
 *
 * 用「已安装的 bin」而不是维护一张内置命令白名单：白名单会越滚越大，而 .bin 是安装的产物，
 * 自动跟着依赖走——依赖删了，它就从这里消失，正好该红。
 *
 * ## 两类刻意放过
 * - **叙述词**（`pnpm workspace + catalog` 这种技术名词组合，不是命令）
 * - **占位符**（`pnpm xxx:gen`、`pnpm build:${app}`、`pnpm <script>`：形态上就不是可执行字面量）
 *
 * 退出码：有违规、或量不到 scripts / 一个文件都没扫到 → 1（仓库口径：量不到一律判失败）。
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const REPO = path.resolve(import.meta.dirname, "..")
const SCAN_EXT = new Set([".md", ".yml", ".yaml", ".mjs", ".ts", ".tsx", ".cmd", ".json", ".toml"])

/** 历史记录与不入库物料不参与：它们描述的是「当时」，改它等于篡改记录 */
const SKIP_DIRS = new Set(["node_modules", ".git", ".artifacts", ".workbuddy-ai", "dist", "target"])
const SKIP_PATHS = new Set(["docs/reference"])

/** pnpm 自己的子命令（不是本仓库的 script，也不在 .bin 里） */
const PNPM_BUILTINS = new Set(
    `install i add remove rm uninstall un link unlink update up upgrade outdated why list ls ll la
    licenses audit exec dlx create init publish pack deploy config store patch patch-commit
    patch-remove approve-builds ignored-builds fetch import rebuild prune dedupe doctor root bin
    env server setup help version recursive view info search s access owner team token whoami
    login logout dist-tag deprecate star stars unpublish repo docs bugs issues run-script run
    test t start stop restart cache cat-file cat-index find-hash self-update completion`
        .split(/\s+/)
        .filter(Boolean),
)

/** 技术名词组合，不是命令（`pnpm workspace` / `pnpm catalog` 出现在「pnpm 的 workspace」叙述里） */
const NARRATIVE = new Set(["workspace", "catalog"])

const COMMAND_RE = /\bpnpm\s+(?:run\s+)?([A-Za-z][\w:-]*)/g

/** 形态上不可能是可执行字面量：模板占位、截断的拼接、通配 */
export function isPlaceholder(name) {
    return name.includes("xxx") || name.endsWith(":") || /[$<*{]/.test(name)
}

/**
 * 找出文本里所有「不认识的 pnpm 命令」。
 * 纯函数，不碰磁盘——测试直接喂文本。
 * @param {string} text
 * @param {Set<string>} known 根 scripts + 已安装 bin
 * @returns {{ name: string, index: number }[]}
 */
export function findUnknownCommands(text, known) {
    const hits = []
    for (const match of text.matchAll(COMMAND_RE)) {
        const name = match[1]
        if (known.has(name) || PNPM_BUILTINS.has(name) || NARRATIVE.has(name)) continue
        if (isPlaceholder(name)) continue
        hits.push({ name, index: match.index })
    }
    return hits
}

/** 偏移量 → 行号（1 起） */
export function lineOf(text, index) {
    return text.slice(0, index).split("\n").length
}

function installedBins() {
    try {
        return readdirSync(path.join(REPO, "node_modules", ".bin")).map((f) =>
            f.replace(/\.(cmd|ps1|exe)$/, ""),
        )
    } catch {
        // .bin 读不到 = 依赖没装。不静默放行：让调用方把「量不到」判成失败
        return null
    }
}

/** 测试文件里的 `pnpm xxx` 多是夹具与反例（故意写错的名字），不是给读者照抄的引用 */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name)
        const rel = path.relative(REPO, abs).replaceAll("\\", "/")
        if (entry.isDirectory()) {
            // 按目录名排除能覆盖任意深度的 node_modules（apps/web/node_modules 之类）
            if (SKIP_DIRS.has(entry.name) || SKIP_PATHS.has(rel)) continue
            yield* walk(abs)
        } else if (SCAN_EXT.has(path.extname(entry.name)) && !TEST_FILE_RE.test(entry.name)) {
            yield { abs, rel }
        }
    }
}

function main() {
    const rootScripts = (() => {
        try {
            const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8"))
            return Object.keys(pkg.scripts ?? {})
        } catch {
            return []
        }
    })()

    const bins = installedBins()

    if (rootScripts.length === 0) {
        console.error("✖ 读不到根 package.json 的 scripts——量不到就是失败，不当作「没有违规」")
        return 1
    }
    if (bins === null) {
        console.error("✖ 读不到 node_modules/.bin（依赖没装？）——量不到就是失败，先 pnpm install")
        return 1
    }

    const known = new Set([...rootScripts, ...bins])
    const violations = []
    let scanned = 0

    for (const { abs, rel } of walk(REPO)) {
        scanned += 1
        const text = readFileSync(abs, "utf8")
        for (const hit of findUnknownCommands(text, known)) {
            violations.push({ file: rel, line: lineOf(text, hit.index), name: hit.name })
        }
    }

    if (scanned === 0) {
        console.error("✖ 一个文件都没扫到——量不到就是失败，检查 SKIP_DIRS 是否把仓库排空了")
        return 1
    }

    if (violations.length === 0) {
        console.log(`✓ 命令字面量无悬空引用（扫 ${scanned} 个文件）`)
        return 0
    }

    console.error(`✖ ${violations.length} 处 pnpm 命令不存在：`)
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line}  pnpm ${v.name}`)
    }
    console.error(
        "\n修法：改名/删除后同步这里的字面量；若它其实是二进制，写成 `pnpm exec <bin>`；" +
            "若是技术名词叙述（pnpm workspace 一类），在 NARRATIVE 里登记。",
    )
    return 1
}

/** 只在作为入口被直接执行时才走 CLI；被测试 import 时只导出纯函数 */
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename
if (isEntry) process.exit(main())
