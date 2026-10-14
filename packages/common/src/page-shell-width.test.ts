import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * 版心宽度门禁：写了 `mx-auto` + `max-w-*` 的那个容器，必须同时自己声明宽度（正常就是 `w-full`）。
 *
 * 机制一句话：auto 外边距会取消 flex / grid 子项的交叉轴 stretch，于是 `width: auto`
 * 退成 fit-content —— 版心的宽度改由**内容**决定。内容是图的时候，图落地那一帧版心从
 * 「只剩 padding」跳到满宽（首页实测 48px → 412px、CLS 0.226；带时间戳的归因、修法与复测见
 * `perf/README.md`「两条位移：定性 → 修掉 → 复测」，最小复现是 `perf/fixtures/cls-fit-content.html`）。
 * `apps/web/src/styles.css` 里 feed-section 那句「`w-full` 不能省」记的是同一个坑的另一次踩法
 * （那次塌的是骨架态，因为骨架是空 div，连固有宽度都没有）。
 *
 * 为什么落成测试而不是注释：这条约定散在十几个调用点上，少写一个 token 不报错、不掉样式，
 * 只在真机上以一次跳动出现——注释已经挡过一次没挡住。判据不需要看父元素：
 * `w-full` 对块级子元素是惰性的（block 的 width:auto 本就铺满），所以「版心自己说清宽度」
 * 可以无条件成立，读代码的人不必替他推父链。
 *
 * 判据是拼写级的：只看同一个类串里 `mx-auto` 与 `max-w-*` 是否同场、有没有显式 `w-*`。
 * 把两半拆进 `cn()` 的两个字面量里能绕过去，但那种写法本身就是在藏一个版心的形状。
 * 手写原生 CSS（`margin-inline: auto` + `max-width`）也不在这条判据里：Tailwind 的
 * `@utility` / `@apply` 走类串那套，扫得到。
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

/**
 * 注释按长度抹成空格（不删）：注释里出现的类名是给人看的说明（styles.css 那条
 * 「`w-full` 不能省」自己就写了完整类串），删掉会让后面的行号全体错位，抹平才不会。
 */
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
        // expect 只收一个参数，所以把「为什么会塌、怎么修」并进被断言的那串文本：
        // 失败时 diff 里的 received 就是完整报告，不用再去猜是哪个容器漏了宽度。
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
