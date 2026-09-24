import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * 共享词表门禁：一个概念在前端只许有一个出口，且那个出口住在它该住的包里。
 *
 * 后端有 `ValidationVocabularyTest` 钉「一条规则一个具名常量」，前端一直是靠人记得住。
 * 记不住的证据（本测试引入时都是真红）：`apps/web` 里 `DeletionDialog` 从 `@shop/app-kit`
 * 导入 `useCountdown`（相对秒数递减），同 app 的 `OrderCard` 从本地 `#/shared/lib/use-countdown`
 * 导入同名 hook（按绝对时刻倒数）——同名不同义，跨文件复制粘贴就会静默换语义。
 *
 * 四条规则各自挡一种漂移：
 * 1. **app 不遮蔽包导出**：app 本地导出的符号名不得与 `packages/*` 的导出名相同
 * 2. **形状的写法只有一份**：掩码段 / 折万算式 / 剪贴板调用，字面量只许出现在 owner 里
 * 3. **owner 之间不互相漂移**：ui-web 刻意不依赖 common（纯 UI 包零内部依赖），
 *    它那两份字面量必须与 common 的 owner **逐字节相等**——常量等式编译期查不了，测试期钉
 * 4. **owner 不是摆设**：每个 owner 至少有一个真实调用点（顺带证明扫描确实扫到了代码）
 *
 * 与 `contract:audit` 一样，它不拥有契约：这些是展示层内部约定，改它们不触发 `pnpm gen:sdk`。
 */

const REPO_ROOT = findRepoRoot()

/** 扫描范围：真正会互相 import 的源码，不含生成物 */
const SOURCE_ROOTS = [
    "apps/web/src",
    "apps/seller/src",
    "apps/admin/src",
    "packages/common/src",
    "packages/app-kit/src",
    "packages/ui-web/src",
]

/** 生成物与测试不参与：routeTree/SDK 是产物，测试里的假数据不算第二次实现 */
const EXCLUDED = /[\\/](routeTree\.gen\.ts|__generated__|test|tests?[\\/])|\.test\.tsx?$/

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
    throw new Error("找不到仓库根（pnpm-workspace.yaml），共享词表门禁无从扫描")
}

/** 一个 .ts/.tsx 文件里 `export function X` / `export const X` / `export { X }` 的具名导出 */
function exportsOf(file: string): string[] {
    const text = code.get(file) ?? ""
    const names = new Set<string>()
    for (const [, name] of text.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
        if (name) names.add(name)
    }
    for (const [, group] of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of (group ?? "").split(",")) {
            const name = part
                .trim()
                .split(/\s+as\s+/)
                .pop()
                ?.trim()
            if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
        }
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
            // 先按目录递归：只认后缀会把整棵子树当成「不是文件就跳过」，扫到的是空目录级
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

/**
 * 剥掉块注释后的文本：门禁要挡的是「第二份实现」，不是「第二处提到」。
 * `ReceiverLine` 的注释里写着 `138****0000` 那是给人看的示例，改不动也不该改。
 * 只剥 `/* *\/` 不剥行注释——行注释里的形状会误报成红，宁误报不空转。
 * 每个形状的 owner 必须「剥完仍命中」（见下一条测试），否则注释吃掉整个文件也能骗绿。
 */
function stripBlockComments(text: string): string {
    return text.replaceAll(/\/\*[\s\S]*?\*\//g, "")
}

const files = sourceFiles()
/** 每个源文件读一次、剥一次注释：后面几条规则都在同一份「代码文本」上判 */
const code = new Map(
    files.map((file) => [file, stripBlockComments(readFileSync(join(REPO_ROOT, file), "utf8"))]),
)

const exportedBy = new Map<string, string[]>()
for (const file of files) {
    for (const name of exportsOf(file)) {
        exportedBy.set(name, [...(exportedBy.get(name) ?? []), file])
    }
}

const isPackage = (file: string) => file.startsWith("packages/")
const isApp = (file: string) => file.startsWith("apps/")

describe("app 不遮蔽 packages 的导出名", () => {
    it("同名 hook/util 出现在 app 本地和包里 = 复制粘贴会静默换语义", () => {
        const shadowed: string[] = []
        for (const [name, at] of exportedBy) {
            const inPackage = at.filter(isPackage)
            const inApp = at.filter(isApp)
            if (inPackage.length > 0 && inApp.length > 0) {
                shadowed.push(`${name}：${[...inPackage, ...inApp].join(" / ")}`)
            }
        }
        expect(shadowed).toEqual([])
    })

    it("扫描本身有效：真扫到了源码与导出", () => {
        expect(files.length).toBeGreaterThan(300)
        expect(exportedBy.size).toBeGreaterThan(200)
    })
})

describe("形状的写法只有一份", () => {
    const owners: Record<string, { pattern: RegExp; allowed: string[] }> = {
        手机号掩码段: {
            pattern: /\*\*\*\*/,
            // AddressFormDialog 的 `139********` 是「智能粘贴」输入框的占位示例文案，
            // 不是第二份掩码实现：它既不产出掩码，也不与 MASK_SEGMENT 同形（8 个星）。
            allowed: [
                "packages/common/src/mask.ts",
                "packages/ui-web/src/components/masked-value.tsx",
                "apps/web/src/address/AddressFormDialog.tsx",
            ],
        },
        大数折万算式: {
            pattern: /\/ 10000/,
            allowed: ["packages/common/src/count.ts"],
        },
        剪贴板写入: {
            pattern: /navigator\.clipboard\.writeText/,
            allowed: ["packages/app-kit/src/copy-text.ts"],
        },
    }

    for (const [what, { pattern, allowed }] of Object.entries(owners)) {
        it(`${what}只出现在 owner 文件`, () => {
            const hits: string[] = []
            for (const file of files) {
                if (allowed.includes(file)) continue
                const line = (code.get(file) ?? "").split("\n").findIndex((l) => pattern.test(l))
                if (line >= 0) hits.push(`${file}:${line + 1}`)
            }
            expect(hits).toEqual([])
        })

        it(`${what}的 owner 剥掉注释后仍命中：门禁不空转`, () => {
            for (const file of allowed) {
                if (file.startsWith("apps/")) continue
                expect(
                    pattern.test(code.get(file) ?? ""),
                    `${file} 是 ${what} 的 owner，剥完注释却找不到该形状`,
                ).toBe(true)
            }
        })
    }
})

describe("零内部依赖的包与 owner 不漂移", () => {
    it("ui-web 的掩码段逐字节等于 common 的 MASK_SEGMENT", () => {
        const uiweb = readFileSync(
            join(REPO_ROOT, "packages/ui-web/src/components/masked-value.tsx"),
            "utf8",
        )
        const common = readFileSync(join(REPO_ROOT, "packages/common/src/mask.ts"), "utf8")
        const local = /const MASK_SEGMENT = "([^"]*)"/.exec(uiweb)?.[1]
        const owner = /export const MASK_SEGMENT = "([^"]*)"/.exec(common)?.[1]
        expect(local, "ui-web 里没找到 MASK_SEGMENT 常量，门禁不能空转").toBeTruthy()
        expect(local).toBe(owner)
    })
})

describe("owner 不是孤儿", () => {
    // 聚合入口 re-export 不算调用点，否则「owner 还在但没人用」也能蒙过这条
    // 判定在剥注释后的文本上做：注释里提一嘴 `maskPhone` 不等于有人在调
    const importedBy = (symbol: string): string[] =>
        files
            .filter((f) => !/\/(mask|count|copy-text)\.ts$/.test(f) && !f.endsWith("src/index.ts"))
            .filter((f) => new RegExp(`\\b${symbol}\\b`).test(code.get(f) ?? ""))

    for (const symbol of ["maskPhone", "MASK_SEGMENT", "compactCount", "copyWithNotify"]) {
        it(`${symbol} 有真实调用点`, () => {
            expect(
                importedBy(symbol).length,
                `${symbol} 没有任何调用点：owner 已无人用，或扫描没扫到`,
            ).toBeGreaterThan(0)
        })
    }
})
