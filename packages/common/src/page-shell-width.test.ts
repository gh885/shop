import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * 版心宽度门禁：写了 `mx-auto` + `max-w-*` 的容器必须自己声明宽度（正常 `w-full`）。防的漂移是——auto 外边距取消 flex/grid 交叉轴 stretch，`width:auto` 退成 fit-content，版心宽度交给内容，图/异步内容落地那一帧整块被推走（首页实测 CLS 0.226，归因/修法见 perf/README.md）。
 * 判据拼写级（同类串里 mx-auto + max-w-* 同场、有无显式 w-*），拆进 cn() 两半或原生 CSS 都绕得过，但那本身就是在藏版心形状。落成测试而非注释：约定散在十几个调用点，少写一个 token 不报错、注释已挡过一次没挡住。
 */

const REPO_ROOT = findRepoRoot()

/** 扫描范围：会写版心的前端源码（含 CSS：@utility 是版心的另一种写法），不含生成物 */
const SOURCE_ROOTS = [
    "apps/web",
    "apps/seller",
    "apps/admin",
    "packages/common",
    "packages/i18n",
    "packages/monitoring",
    "packages/client",
    "packages/app-kit",
    "packages/ui-web",
]

/** 生成物、vendored、测试与构建产物不参与：测试里的类串是夹具，reui 是上游源码 */
const EXCLUDED =
    /[\\/](node_modules|dist|__generated__|routeTree\.gen\.ts|route\.gen\.ts|sdk[\\/]|reui[\\/])|\.test\.tsx?$/

/** 显式宽度：`(?:^|\s)` 这个锚点同时把 `min-w-` / `max-w-` 里的 `w-` 挡在外面 */
const EXPLICIT_WIDTH = /(?:^|\s)w-/
const MAX_WIDTH = /(?:^|\s)max-w-/
const AUTO_X_MARGIN = /(?:^|\s)mx-auto(?:\s|$)/

function findRepoRoot(): string {
    let dir = import.meta.dirname
    for (let up = 0; up < 6; up++) {
        try {
            statSync(join(dir, "pnpm-workspace.yaml"))
            return dir
        } catch {
            dir = join(dir, "..")
        }
    }
    throw new Error("找不到仓库根（pnpm-workspace.yaml），版心宽度门禁无从扫描")
}

/** 一个文件里所有「类串」及其行号：tsx/ts 取字符串字面量，css 取 @apply 的参数 */
function classStringsOf(file: string): { line: number; text: string }[] {
    const text = blankComments(readFileSync(join(REPO_ROOT, file), "utf8"))
    const found: { line: number; text: string }[] = []
    const pattern = file.endsWith(".css") ? /@apply\s+([^;]+);/g : /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g
    for (const match of text.matchAll(pattern)) {
        const raw = match[0]
        found.push({
            line: text.slice(0, match.index).split("\n").length,
            text: file.endsWith(".css") ? raw : raw.slice(1, -1),
        })
    }
    return found
}

/** 注释按长度抹成空格（不删）：注释里的类名是给人看的，删掉会让后面的行号全体错位，抹平才不会 */
function blankComments(source: string): string {
    return source.replaceAll(/\/\*[\s\S]*?\*\//g, (block) => block.replaceAll(/[^\n]/g, " "))
}

function sourceFiles(): string[] {
    const out: string[] = []
    for (const root of SOURCE_ROOTS) {
        const abs = join(REPO_ROOT, root)
        if (statSync(abs, { throwIfNoEntry: false })) walkDir(abs)
    }
    function walkDir(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const abs = join(dir, entry.name)
            // 先按目录递归：只认后缀会把整棵子树当成「不是文件就跳过」，扫到的是空目录级
            if (entry.isDirectory()) {
                walkDir(abs)
                continue
            }
            if (!/\.(ts|tsx|css)$/.test(entry.name)) continue
            const rel = relative(REPO_ROOT, abs).replaceAll("\\", "/")
            if (!EXCLUDED.test(rel)) out.push(rel)
        }
    }
    return out.toSorted()
}

describe("版心宽度门禁", () => {
    it("写了 mx-auto + max-w-* 的类串都自己声明了宽度", () => {
        const violations: string[] = []
        for (const file of sourceFiles()) {
            for (const { line, text } of classStringsOf(file)) {
                if (!AUTO_X_MARGIN.test(text) || !MAX_WIDTH.test(text)) continue
                if (EXPLICIT_WIDTH.test(text)) continue
                violations.push(`${file}:${line}  ${text}`)
            }
        }
        // expect 只收一个参数，所以把「为什么塌、怎么修」并进被断言的文本：失败时 diff 的 received 就是完整报告
        const report =
            violations.length === 0
                ? ""
                : [
                      `这 ${violations.length} 处版心的宽度交给内容决定了（mx-auto 取消 stretch → fit-content），`,
                      "图或异步内容落地时会把整块推走。补 w-full（对块级子元素是惰性的，不会改坏现在的观感）：",
                      ...violations,
                  ].join("\n")
        expect(report).toBe("")
    })

    it("扫描确实扫到了版心（判据本身没写空）", () => {
        // 与 shared-vocabulary 同一条顾虑：扫不到任何文件的门禁永远绿，看着像通过其实空转。
        const scanned = sourceFiles()
        expect(scanned.length, "一个前端源文件都没扫到，扫描范围写错了").toBeGreaterThan(500)
        const shells = scanned.filter((file) =>
            classStringsOf(file).some(
                ({ text }) => AUTO_X_MARGIN.test(text) && MAX_WIDTH.test(text),
            ),
        )
        expect(
            shells.length,
            "全仓库没有一处 mx-auto + max-w-* 的版心，判据不可能在生效",
        ).toBeGreaterThan(5)
    })
})
