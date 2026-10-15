import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * 公开面消费门禁：共享逻辑包对外导出的每个具名符号，必须真有人在生产代码里用它。
 *
 * 为什么需要它：`fallow` 也做符号级 unused-export，但它把测试文件与 re-export 边都算「消费点」，
 * 于是两类漏网——只有测试在调的（`loadChildren`：regions/address 两个 test 引用、产品代码零调用）
 * 会蒙绿；而「生成常量 + 一处 re-export」这种刻意公共 API（`SOURCE_LOCALE`）反过来会被误报成死码。
 * 本文件按**生产消费**这条更严的尺子扫 4 个纯逻辑包，把前者常驻挡下。
 *
 * 判据（与 `shared-vocabulary.test.ts` 同源：只从代码看，不看注释）：一个具名值导出算「活着」，当且仅当
 * - 有**外部生产消费点**：非 barrel、非测试、非定义文件本身的其他源文件引用了它，或
 * - **同文件在用**：定义它的文件自己就调用了它（导出的公开形状 / 被同模块其它函数复用的工具）。
 *
 * 两者都不满足 = 死导出。barrel（各 `index.ts`）只做聚合 re-export，从不计入消费点，否则「还在 barrel
 * 里挂着」会给死码发通行证。`.gen.ts` 与 vendored reui 不在定义范围：生成物的导出不是手写出口，
 * 第三方内部行为不由本仓约束。跨包同名符号按名字匹配、不追踪 import 图——与 `shared-vocabulary`
 * 一样是已知粗粒度：它宁可漏报一个撞名的死符号，也不误伤一个活符号。
 */

const REPO_ROOT = findRepoRoot()

/** 消费点搜索范围：真正会互相 import 的源码，不含生成物（与 shared-vocabulary 同一份清单） */
const SOURCE_ROOTS = [
    "apps/web/src",
    "apps/seller/src",
    "apps/admin/src",
    "packages/common/src",
    "packages/i18n/src",
    "packages/monitoring/src",
    "packages/client/src",
    "packages/app-kit/src",
    "packages/ui-web/src",
]

/** 本门禁管「共享逻辑包对外导出的死符号」：只扫这 4 个纯逻辑包的导出，UI/胶水包的大面交给 fallow */
const DEFINITION_ROOTS = [
    "packages/common/src/",
    "packages/i18n/src/",
    "packages/monitoring/src/",
    "packages/client/src/",
]

/** 测试与生成物不参与（消费点要落在生产代码上）；reui vendored 组件不约束 */
const EXCLUDED =
    /[\\/](routeTree\.gen\.ts|__generated__|test|tests?[\\/])|\.test\.tsx?$|[\\/]components[\\/]reui[\\/]/

const GENERATED = /\.gen\.ts$/
const BARREL = /(^|\/)index\.ts$/

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
    throw new Error("找不到仓库根（pnpm-workspace.yaml），公开面门禁无从扫描")
}

/**
 * 一个 .ts/.tsx 里 `export function/const/let/class X` 的真定义符号。
 *
 * 只认定义、不认 `export { X } from "./y"` 那种 re-export：re-export 是「对外暴露」不是「本文件产出」，
 * 把它当定义去查消费点会误伤——`@shop/i18n` 的 `SOURCE_LOCALE` 就是这么被误判的：它由 `i18n-config.mjs`
 * 生成进 `config.gen.ts`（有意作为公共 API），`locale.ts` 只是 re-export 它，查它「本文件有没有用」必假红。
 */
function exportsOf(text: string): string[] {
    const names = new Set<string>()
    for (const [, name] of text.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
        if (name) names.add(name)
    }
    return [...names]
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
            if (entry.isDirectory()) {
                walkDir(abs)
                continue
            }
            if (!/\.(ts|tsx)$/.test(entry.name)) continue
            if (EXCLUDED.test(abs)) continue
            out.push(relative(REPO_ROOT, abs).replaceAll("\\", "/"))
        }
    }
    return out.toSorted()
}

/** 剥掉块注释与整行 `//` 注释：门禁看的是代码调用，注释里提一嘴不算有人在用 */
function stripComments(text: string): string {
    return text
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n")
}

const files = sourceFiles()
const code = new Map(
    files.map((file) => [file, stripComments(readFileSync(join(REPO_ROOT, file), "utf8"))]),
)

const isDefinition = (file: string) => DEFINITION_ROOTS.some((root) => file.startsWith(root))
const isBarrel = (file: string) => BARREL.test(file)

/** 独立标识符出现（前后不接 `.` 与词字符）：`foo.bar` 属性、字符串尾巴都不误算 */
function references(sym: string, text: string): boolean {
    return new RegExp(`(?<![\\w$.])${sym}(?![\\w$])`).test(text)
}

/**
 * 「同文件在用」——**剥掉定义行之后**再找。
 *
 * 不剥的话这一支恒为真：定义文件的全文里必然含 `export function X` 那一行，正则在那儿
 * 必命中，于是门禁整个空转（实测 `monitoringUser` 生产零消费、只被测试与 barrel 引用，
 * 仍一路蒙绿）。剥掉后它才真的在问「这个文件自己有没有用它」。
 *
 * 只剥**第一处、只剥到符号名**：递归、以及被同文件别的函数复用，都仍算「在用」——
 * 宁可漏报一个「只递归没人用」的导出，也不误伤一个真在用的（与 `references` 同一取向）。
 */
function usesInOwnFile(sym: string, text: string): boolean {
    const declaration = new RegExp(
        `^(export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+)${sym}\\b`,
        "m",
    )
    return references(sym, text.replace(declaration, "$1"))
}

const dead: string[] = []
let scanned = 0
for (const def of files) {
    if (!isDefinition(def) || isBarrel(def) || GENERATED.test(def)) continue
    for (const sym of exportsOf(code.get(def) ?? "")) {
        scanned += 1
        // 同文件在用即算数（公开形状 / 被本模块其它函数复用）
        if (usesInOwnFile(sym, code.get(def) ?? "")) continue
        // 否则要有外部生产消费点：非 barrel、非定义文件的其他源文件引用它
        const consumed = files.some(
            (f) => f !== def && !isBarrel(f) && references(sym, code.get(f) ?? ""),
        )
        if (!consumed) dead.push(`${sym} (${def})`)
    }
}

describe("共享逻辑包的公开导出都有真实消费点", () => {
    it("没有只被测试引用、产品代码没人用的死导出（fallow 把测试算消费点，这条按生产消费判）", () => {
        expect(dead).toEqual([])
    })

    it("扫描本身有效：真扫到了共享逻辑包的导出（数量掉到两位数以下 = 判据脱靶，不能悄悄全绿）", () => {
        expect(files.length).toBeGreaterThan(300)
        expect(scanned).toBeGreaterThan(80)
    })
})
