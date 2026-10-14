import { describe, expect, it } from "vite-plus/test"
import {
    extractContractTypes,
    extractInlineShapes,
    findViolations,
    isScannable,
    normalizeType,
    parseTypeBody,
} from "./shape-drift.mjs"

/**
 * 只测判定，不测走盘：这条门禁唯一会出错的地方是「什么算同构、什么不算」。
 * 三条口径各有一组反例（子集不算、字面量不算、`Array<X>` 必须归一），
 * 每一条都是实测踩出来的——写反了门禁就会静默漏检或变成噪声。
 */

describe("normalizeType", () => {
    it("Array<X> 与 X[] 归一成同一个形状", () => {
        expect(normalizeType("Array<string>")).toBe("string[]")
        expect(normalizeType("ReadonlyArray<string>")).toBe("string[]")
        expect(normalizeType("string[]")).toBe("string[]")
    })
})

describe("parseTypeBody", () => {
    it("归一后 Array<X> 与 X[] 同签名（不归一则会漏掉全部真阳性）", () => {
        expect(parseTypeBody("lines: Array<OrderLineRequest>;")).toBe(
            parseTypeBody("lines: OrderLineRequest[]"),
        )
    })

    it("对象字面量不算类型：属性访问 props.id 不是类型", () => {
        expect(parseTypeBody("id: props.id,\nname: props.name")).toBeNull()
    })

    it("字面量值不算类型", () => {
        expect(parseTypeBody(`label: "hello",\nvalue: 42`)).toBeNull()
    })

    it("少于两个字段不报（噪声）", () => {
        expect(parseTypeBody("id: string")).toBeNull()
    })

    it("可选标记进签名，? 与必填不同构", () => {
        expect(parseTypeBody("a?: string;\nb: number")).not.toBe(
            parseTypeBody("a: string;\nb: number"),
        )
    })

    it("字段顺序不影响同构", () => {
        expect(parseTypeBody("a: string;\nb: number")).toBe(parseTypeBody("b: number\na: string"))
    })
})

describe("extractContractTypes", () => {
    it("抽出具名对象类型，并做归一", () => {
        const src = "export type Foo = {\n    a: string;\n    b: Array<number>;\n};\n"
        expect(extractContractTypes(src).get("a:string | b:number[]")).toBe("Foo")
    })

    it("函数签名/别名不进候选（不是对象类型）", () => {
        const src = "export type Bar = (a: string) => void\nexport type Baz = string\n"
        expect(extractContractTypes(src).size).toBe(0)
    })
})

describe("findViolations", () => {
    const contractTypes = new Map([["a:string | b:number[]", "Foo"]])

    it("逐字同构 → 报", () => {
        const hits = findViolations({
            path: "apps/web/src/x.ts",
            source: "const x: { a: string; b: number[] } = y\n",
            contractTypes,
        })
        expect(hits).toHaveLength(1)
        expect(hits[0].contractType).toBe("Foo")
    })

    it("子集 → 不报（否则门禁全是噪声）", () => {
        const hits = findViolations({
            path: "apps/web/src/x.ts",
            source: "const x: { a: string } = y\n",
            contractTypes,
        })
        expect(hits).toEqual([])
    })

    it("多一个字段 → 不报", () => {
        const hits = findViolations({
            path: "apps/web/src/x.ts",
            source: "const x: { a: string; b: number[]; c: boolean } = y\n",
            contractTypes,
        })
        expect(hits).toEqual([])
    })

    it("跨行形状也能抓到", () => {
        const hits = findViolations({
            path: "apps/web/src/x.ts",
            source: "function f(args: {\n    a: string\n    b: number[]\n}) {}\n",
            contractTypes,
        })
        expect(hits).toHaveLength(1)
    })

    it("行号是形状起始行，不是文件行", () => {
        const hits = findViolations({
            path: "apps/web/src/x.ts",
            source: "const a = 1\nconst b = 2\nconst x: { a: string; b: number[] } = y\n",
            contractTypes,
        })
        expect(hits[0].line).toBe(3)
    })
})

describe("extractInlineShapes", () => {
    it("嵌套对象只报外层（内层字段值含 { 时整块被拒）", () => {
        const shapes = extractInlineShapes("const x: { a: string; b: { c: number } } = y")
        expect(shapes).toHaveLength(0)
    })
})

describe("isScannable", () => {
    it("生成物 / vendored / node_modules 不扫", () => {
        expect(isScannable("packages/api/src/sdk/types.gen.ts")).toBe(false)
        expect(isScannable("packages/ui-web/src/components/reui/data-grid/x.tsx")).toBe(false)
        expect(isScannable("apps/web/src/locales/messages.gen.ts")).toBe(false)
        expect(isScannable("node_modules/foo/index.ts")).toBe(false)
        expect(isScannable("apps/web/src/README.md")).toBe(false)
    })

    it("业务源码与测试都扫", () => {
        expect(isScannable("apps/web/src/order/queries.ts")).toBe(true)
        expect(isScannable("packages/app-kit/src/auth/use-captcha.test.tsx")).toBe(true)
    })
})
