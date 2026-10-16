import { describe, expect, it } from "vite-plus/test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * 公开面消费门禁：共享逻辑包对外导出的每个具名符号必须有真实生产消费点，否则=死导出。防的漂移是 fallow 把测试文件与 re-export 边都算消费点，于是「只有测试在调、产品代码零调用」的死码蒙绿（如 loadChildren）——这条按**生产消费**这把更严的尺子扫，barrel 与 .test 不计入消费点。
 * 判据与 shared-vocabulary 同源（只看代码不看注释）；跨包同名按名字匹配、不追 import 图，宁可漏报撞名死码也不误伤活符号。
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

/** 只认真定义（export function/const/let/class X），不认 export { X } from 的 re-export：把 re-export 当定义查消费点会误伤（@shop/i18n 的 SOURCE_LOCALE 由 config.gen.ts 生成、locale.ts 只 re-export，查「本文件用没用」必假红） */
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

/** 「同文件在用」须**剥掉定义行之后**再找：不剥则全文必含 `export ... X` 那行、正则恒命中，门禁整个空转（实测 monitoringUser 生产零消费仍蒙绿）。只剥第一处、只到符号名：递归与被同文件别的函数复用仍算在用，宁可漏报不空转 */
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
        if (usesInOwnFile(sym, code.get(def) ?? "")) continue
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
