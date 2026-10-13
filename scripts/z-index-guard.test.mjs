import { describe, expect, it } from "vite-plus/test"
import {
    ALLOWED_UTILITIES,
    GLOBAL_BAND_MIN,
    findOffendersInLine,
    findViolations,
    isScannable,
    stripComments,
} from "./z-index-guard.mjs"

/**
 * 只测判定，不测走盘：这条门禁唯一会出错的地方是「什么算违规、什么不算」。
 * 每条口径都配了反例——写反了门禁要么静默漏检（等于没做），要么变成噪声（被人绕过）。
 */

describe("stripComments", () => {
    it("块注释里的 z-40 不算违规（否则门禁逼人不敢写注释）", () => {
        expect(findOffendersInLine(stripComments("/* 吸顶头 z-40 是刻意的 */"))).toEqual([])
        expect(findOffendersInLine(stripComments("/**\n * 见 z-50 那条注释\n */"))).toEqual([])
    })

    it("行注释里的 z-50 不算违规", () => {
        expect(findOffendersInLine(stripComments("// 这里原本是 z-50"))).toEqual([])
    })

    it("URL 里的 // 不吞掉本行后半截", () => {
        // 若不排除 `:` 后的 `//`，这条会把 className 一起吃掉 → 静默漏检
        const stripped = stripComments('const u = "https://x.test/a"; const c = "z-50"')
        expect(stripped).toContain("z-50")
    })
})

describe("findOffendersInLine", () => {
    it("裸数值 >= 30 违规", () => {
        expect(findOffendersInLine('className="fixed inset-0 z-50"')).toHaveLength(1)
        expect(findOffendersInLine('className="sticky top-0 z-30"')).toHaveLength(1)
        expect(findOffendersInLine('className="sticky top-0 z-40"')).toHaveLength(1)
    })

    it("30 以下是组件内部相对层级，放行", () => {
        expect(findOffendersInLine('className="absolute z-10"')).toEqual([])
        expect(findOffendersInLine('className="absolute z-20"')).toEqual([])
        expect(findOffendersInLine('className="absolute z-0"')).toEqual([])
        expect(findOffendersInLine('className="absolute -z-10"')).toEqual([])
    })

    it("token utility 一律放行（直接读 ALLOWED_UTILITIES，避免加档后测试漂移）", () => {
        expect(ALLOWED_UTILITIES.length).toBeGreaterThan(0)
        for (const token of ALLOWED_UTILITIES) {
            expect(findOffendersInLine(`className="${token}"`)).toEqual([])
        }
    })

    it("变体前缀不影响判定", () => {
        expect(findOffendersInLine('className="group-hover:z-50"')).toHaveLength(1)
        expect(findOffendersInLine('className="data-[side=bottom]:z-50"')).toHaveLength(1)
    })

    it("任意值一律违规（数值不可见，无法统一调档）", () => {
        expect(findOffendersInLine('className="z-[35]"')).toHaveLength(1)
        expect(findOffendersInLine('className="z-[calc(1000-var(--i))]"')).toHaveLength(1)
    })

    it("内联样式的 zIndex >= 30 违规", () => {
        expect(findOffendersInLine("style={{ zIndex: 9999 }}")).toHaveLength(1)
        expect(findOffendersInLine("style={{ zIndex: 10 }}")).toEqual([])
    })

    it("不误伤以 z- 结尾的其它标识符", () => {
        expect(findOffendersInLine("const x = mz30")).toEqual([])
        expect(findOffendersInLine('"--z-index-overlay"')).toEqual([])
    })

    it("下界就是 GLOBAL_BAND_MIN（判据写死，别漂）", () => {
        expect(GLOBAL_BAND_MIN).toBe(30)
        expect(findOffendersInLine("z-29")).toEqual([])
        expect(findOffendersInLine("z-30")).toHaveLength(1)
    })
})

describe("isScannable", () => {
    it("只扫业务侧 ts/tsx，不扫测试", () => {
        expect(isScannable("apps/web/src/home/HomeHeader.tsx")).toBe(true)
        expect(isScannable("apps/web/src/home/HomeHeader.test.tsx")).toBe(false)
        expect(isScannable("apps/web/src/styles.css")).toBe(false)
    })
})

describe("findViolations", () => {
    it("报告行号与原因，且跳过测试文件", () => {
        const source = 'const a = 1\nconst c = "z-50"\n'
        expect(findViolations("apps/web/src/a.tsx", source)).toEqual([
            expect.objectContaining({ line: 2, raw: "z-50" }),
        ])
        expect(findViolations("apps/web/src/a.test.tsx", source)).toEqual([])
    })
})
