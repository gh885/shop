import { describe, expect, it } from "vite-plus/test"
import { findUnknownCommands, isPlaceholder, lineOf } from "./commands-drift.mjs"

const KNOWN = new Set(["db:up", "build", "typecheck"])

describe("findUnknownCommands", () => {
    it("认识的命令不报", () => {
        expect(findUnknownCommands("跑 `pnpm db:up` 或 `pnpm build`", KNOWN)).toEqual([])
    })

    it("pnpm 内置命令不报（install / exec / view）", () => {
        expect(
            findUnknownCommands("pnpm install && pnpm exec vp check && pnpm view foo", KNOWN),
        ).toEqual([])
    })

    it("已删掉的命令必报——这正是门禁存在的理由", () => {
        const hits = findUnknownCommands("先 pnpm build:web 再 pnpm dev:seller", KNOWN)
        expect(hits.map((h) => h.name)).toEqual(["build:web", "dev:seller"])
    })

    it("pnpm run 前缀也认", () => {
        expect(findUnknownCommands("pnpm run build:web", KNOWN)[0].name).toBe("build:web")
    })

    it("叙述词不报（pnpm workspace + catalog 是技术名词）", () => {
        expect(findUnknownCommands("monorepo，pnpm workspace + catalog", KNOWN)).toEqual([])
    })

    it("占位符不报（模板、截断拼接、通配）", () => {
        expect(
            findUnknownCommands("跑 `pnpm xxx:gen`、`pnpm build:${app}`、`pnpm <script>`", KNOWN),
        ).toEqual([])
    })

    it("带偏移量，能算出行号", () => {
        const text = "第一行\n第二行\n跑 pnpm gone:away 吧"
        const [hit] = findUnknownCommands(text, KNOWN)
        expect(lineOf(text, hit.index)).toBe(3)
    })
})

describe("isPlaceholder", () => {
    it("识别模板与截断形态", () => {
        for (const name of ["xxx:gen", "build:", "build:${app}", "<script>", "*"]) {
            expect(isPlaceholder(name)).toBe(true)
        }
    })
    it("正常命令名不算占位符", () => {
        expect(isPlaceholder("db:up")).toBe(false)
    })
})
