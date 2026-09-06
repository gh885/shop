import type { CategoryAttrNodeResponse } from "../../data"

import { describe, expect, it } from "vitest"

import { buildSkuRowsFromSelections } from "./sku-combinator"

/**
 * 测试夹具：类目属性模板节点与选值的可控构造。
 * 模板节点顺序即维度顺序；金额/库存等字段与本模块无关，取合法默认值。
 */
function makeNode(attrId: string, name: string, values: string[]): CategoryAttrNodeResponse {
    return {
        attr: {
            id: attrId,
            categoryId: "cat-1",
            name,
            kind: "SPEC",
            required: true,
            allowCustom: true,
            allowImage: false,
            sort: 0,
            status: "ENABLED",
            createdAt: "2026-01-01T00:00:00Z",
        },
        values: values.map((v, i) => ({
            id: `${attrId}-v${i}`,
            attrId,
            value: v,
            sort: i,
            source: "PLATFORM",
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
        })),
    }
}

function makeSelection(attrId: string, valueIds: string[] = [], customValues: string[] = []) {
    return { attrId, valueIds, customValues }
}

describe("buildSkuRowsFromSelections", () => {
    it("无任何选值时生成单规格一行", () => {
        const rows = buildSkuRowsFromSelections([makeNode("a1", "颜色", ["红"])], [])

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ label: "单规格", skuId: "", status: "ON_SALE" })
    })

    it("只选了一个模板、没选值时仍是单规格（选了维度但值为空不算选择）", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", [], [])])

        expect(rows).toHaveLength(1)
        expect(rows[0]?.label).toBe("单规格")
    })

    it("单维度多值：每个值一行，label 用取值文本", () => {
        const template = [makeNode("a1", "颜色", ["红", "蓝"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0", "a1-v1"])])

        expect(rows.map((r) => r.label)).toEqual(["红", "蓝"])
    })

    it("多维度做笛卡尔积，且按模板维度顺序拼接 label", () => {
        const template = [makeNode("a1", "颜色", ["红", "蓝"]), makeNode("a2", "尺码", ["M", "L"])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", ["a1-v0", "a1-v1"]),
            makeSelection("a2", ["a2-v0", "a2-v1"]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["红 / M", "红 / L", "蓝 / M", "蓝 / L"])
    })

    it("模板里有但没被选的维度不进入组合", () => {
        const template = [makeNode("a1", "颜色", ["红"]), makeNode("a2", "尺码", ["M"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0"])])

        expect(rows.map((r) => r.label)).toEqual(["红"])
    })

    it("自定义值文本参与组合且首尾空白被裁剪，空文本被丢弃", () => {
        const template = [makeNode("a1", "颜色", [])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", [], ["  军绿  ", "   "]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["军绿"])
    })

    it("模板值与自定义值可同维度混用，模板值在前", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", ["a1-v0"], ["军绿"]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["红", "军绿"])
    })

    it("选值引用了不在模板里的 valueId 时安全跳过", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["ghost-id"])])

        expect(rows).toHaveLength(1)
        expect(rows[0]?.label).toBe("单规格")
    })

    it("生成的行全部是空价格/库存的新建态", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0"])])

        expect(rows[0]).toMatchObject({
            skuId: "",
            priceText: "",
            stockText: "",
            skuCode: "",
        })
    })
})
