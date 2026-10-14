import { describe, expect, it } from "vite-plus/test"
import {
    PRIMITIVE_FAMILIES,
    THEME_FILE,
    collectDeclaredColors,
    collectDeclaredPrimitives,
    countColorConsumers,
    countReferences,
    findBarePrimitiveUses,
    findDeadColors,
    findDeadPrimitives,
    isScannable,
    scrubAllowedForms,
} from "./token-guard.mjs"

/**
 * 只测判定，不测走盘（与 z-index-guard.test.mjs 同一立场）：这条门禁会出错的地方是
 * 「什么算违规、什么不算」。每条口径都配反例——写反了要么静默漏检（等于没做），
 * 要么变成噪声（被人 LEFTHOOK_EXCLUDE 绕过）。
 */

const asMap = (entries) => new Map(entries)

describe("stripComments", () => {
    it("注释里提到的 token 不算违规（否则门禁逼人不敢写注释）", () => {
        expect(findBarePrimitiveUses("a.tsx", "/* bg-neutral-500 会命中内置色板 */")).toEqual([])
        expect(findBarePrimitiveUses("a.tsx", "// 原来是 text-orange-300")).toEqual([])
    })
})

describe("scrubAllowedForms", () => {
    it("var() 引用是合法用法（语义层/端级主题的写法）", () => {
        expect(scrubAllowedForms("color: var(--neutral-500);")).not.toContain("neutral-500")
        expect(scrubAllowedForms("color: var(--orange-600);")).not.toContain("orange-600")
    })

    it("var() 里带 fallback 也放行", () => {
        expect(scrubAllowedForms("color: var(--orange-600, red);")).not.toContain("orange-600")
    })

    it("Tailwind 内置色板命名空间（--color-x-500）不算我们的 primitive", () => {
        expect(scrubAllowedForms("var(--color-amber-500)")).not.toContain("amber-500")
        expect(findBarePrimitiveUses("a.tsx", "var(--color-amber-500)")).toEqual([])
    })

    it("声明行不算违规", () => {
        expect(findBarePrimitiveUses(THEME_FILE, "    --orange-200: hsl(15 94% 84%);")).toEqual([])
    })

    it("擦除不改变行数（否则报的行号会漂）", () => {
        const source = "a\nvar(--neutral-100)\nb\n"
        expect(scrubAllowedForms(source).split("\n")).toHaveLength(source.split("\n").length)
    })
})

describe("findBarePrimitiveUses", () => {
    it("裸写色阶违规，任意 utility 前缀都算", () => {
        expect(findBarePrimitiveUses("a.tsx", 'className="bg-neutral-500"')).toHaveLength(1)
        expect(findBarePrimitiveUses("a.tsx", 'className="text-orange-300"')).toHaveLength(1)
        expect(findBarePrimitiveUses("a.tsx", 'className="hover:border-red-500"')).toHaveLength(1)
        expect(findBarePrimitiveUses("a.tsx", 'className="fill-amber-400"')).toHaveLength(1)
    })

    it("变体前缀与任意值语法都不影响判定", () => {
        expect(findBarePrimitiveUses("a.tsx", 'className="dark:bg-indigo-500"')).toHaveLength(1)
        expect(findBarePrimitiveUses("a.tsx", 'className="bg-(--orange-300)"')).toHaveLength(1)
    })

    it("语义 token 一律放行（Layer 2 才是业务侧该写的）", () => {
        expect(
            findBarePrimitiveUses("a.tsx", 'className="bg-muted text-muted-foreground"'),
        ).toEqual([])
        expect(
            findBarePrimitiveUses("a.tsx", 'className="bg-primary text-primary-foreground"'),
        ).toEqual([])
        expect(findBarePrimitiveUses("a.tsx", 'className="bg-cta-alt-hover"')).toEqual([])
    })

    it("不误伤同形的非色阶标识符", () => {
        expect(findBarePrimitiveUses("a.tsx", "const neutral200 = 1")).toEqual([])
        expect(findBarePrimitiveUses("a.tsx", 'className="bg-neutral-foreground"')).toEqual([])
        expect(findBarePrimitiveUses("a.tsx", 'const x = "orange-abc"')).toEqual([])
    })

    it("报行号与列号（在擦除后的行上，擦除不改行数）", () => {
        const source = 'const a = 1\nconst c = "bg-blue-500"\n'
        expect(findBarePrimitiveUses("a.tsx", source)).toEqual([
            expect.objectContaining({ line: 2, raw: "blue-500" }),
        ])
    })
})

describe("isScannable", () => {
    it("扫业务侧 ts/tsx/css，不扫测试", () => {
        expect(isScannable("apps/web/src/home/HomeHeader.tsx")).toBe(true)
        expect(isScannable("packages/app-kit/src/shell/workbench/theme.css")).toBe(true)
        expect(isScannable("apps/web/src/home/HomeHeader.test.tsx")).toBe(false)
    })

    it("不扫 vendored 积木与生成物", () => {
        expect(isScannable("packages/ui-web/src/components/reui/badge.tsx")).toBe(false)
        expect(isScannable("packages/api/src/sdk/client.ts")).toBe(false)
        expect(isScannable("apps/web/src/routeTree.gen.ts")).toBe(false)
    })
})

describe("collectDeclaredPrimitives / collectDeclaredColors", () => {
    const theme = [
        ":root {",
        "    --neutral-100: hsl(30 5% 96%);",
        "    --orange-600: #ff5000;",
        "}",
        "@theme {",
        "    --color-primary: var(--orange-600);",
        "    --radius: 0.25rem;",
        "}",
    ].join("\n")

    it("primitive 只从 :root 里抽，语义色只从 @theme 里抽", () => {
        expect(collectDeclaredPrimitives(theme).map((t) => t.name)).toEqual([
            "--neutral-100",
            "--orange-600",
        ])
        expect(collectDeclaredColors(theme).map((t) => t.name)).toEqual(["--color-primary"])
    })

    it("行号是原文行号，不是剥注释后的行号", () => {
        const withComment = [
            "/* 两行",
            "   注释 */",
            ":root {",
            "    --neutral-100: red;",
            "}",
        ].join("\n")
        expect(collectDeclaredPrimitives(withComment).map((t) => t.line)).toEqual([4])
    })
})

describe("countReferences", () => {
    it("只认 var(--name)，且边界收紧（--orange-50 不吃 --orange-500）", () => {
        const sources = asMap([
            ["a.css", "var(--orange-50)"],
            ["b.css", "var(--orange-600)"],
        ])
        const counts = countReferences(sources, ["--orange-50", "--orange-600", "--orange-500"])
        expect(counts.get("--orange-50")).toBe(1)
        expect(counts.get("--orange-600")).toBe(1)
        expect(counts.get("--orange-500")).toBe(0)
    })

    it("注释里的引用不算", () => {
        const sources = asMap([["a.css", "/* var(--orange-600) */"]])
        expect(countReferences(sources, ["--orange-600"]).get("--orange-600")).toBe(0)
    })
})

describe("findDeadPrimitives", () => {
    it("零引用才报，有一处引用就放行", () => {
        const declared = [
            { name: "--orange-600", line: 1 },
            { name: "--orange-500", line: 2 },
        ]
        const dead = findDeadPrimitives(
            declared,
            asMap([
                ["--orange-600", 3],
                ["--orange-500", 0],
            ]),
        )
        expect(dead.map((t) => t.raw)).toEqual(["--orange-500"])
    })
})

describe("countColorConsumers / findDeadColors", () => {
    it("类名算消费者，语义名字的子串不算（bg-primary-subtle 不给 primary 记一笔）", () => {
        const sources = asMap([["a.tsx", 'className="bg-primary-subtle text-primary-foreground"']])
        const counts = countColorConsumers(sources, ["--color-primary", "--color-primary-subtle"])
        expect(counts.get("--color-primary")).toBe(0)
        expect(counts.get("--color-primary-subtle")).toBe(1)
    })

    it("带透明度后缀的类名算消费者（ring-ring/50）", () => {
        const counts = countColorConsumers(asMap([["a.tsx", 'className="ring-ring/50"']]), [
            "--color-ring",
        ])
        expect(counts.get("--color-ring")).toBe(1)
    })

    it("零消费者的语义色报出来", () => {
        const declared = [
            { name: "--color-primary", line: 1 },
            { name: "--color-nobody-uses-me", line: 2 },
        ]
        const counts = asMap([
            ["--color-primary", 5],
            ["--color-nobody-uses-me", 0],
        ])
        expect(findDeadColors(declared, counts).map((t) => t.raw)).toEqual([
            "--color-nobody-uses-me",
        ])
    })
})

describe("常量", () => {
    it("色族名单与声明处写死，别漂", () => {
        expect(PRIMITIVE_FAMILIES).toContain("neutral")
        expect(PRIMITIVE_FAMILIES).toContain("orange")
        expect(THEME_FILE).toBe("packages/ui-web/src/styles.css")
    })
})
