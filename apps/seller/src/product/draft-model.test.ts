import type { CategoryAttrNodeResponse, SkuResponse } from "@shop/api/sdk"
import { money } from "@shop/common"

import { describe, expect, it } from "vitest"

import {
    buildSkuRowsFromSelections,
    countInputSchema,
    mergeLocalPricedRows,
    mergeSkuRows,
    rowFromSku,
    toSkuUpdateItems,
    unpricedRows,
    yuanPriceSchema,
    type SkuDraftRow,
} from "./draft-model"

// ---------- 夹具 ----------

/** 夹具 1：类目属性模板节点与选值的可控构造（模板节点顺序即维度顺序；金额/库存等字段与本模块无关，取合法默认值） */
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
            updatedAt: "2026-01-01T00:00:00Z",
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

/**
 * 夹具 2：SkuResponse 可控构造（关心维度：label 拼接、价格/null、库存、编码、状态）。
 * 价格按「分」书写，夹具内换成 Money——测试正文不必到处写对象字面量。
 */
function makeSku(
    id: string,
    attrs: string[],
    opts: {
        price?: number | null
        stock?: number
        skuCode?: string | null
        status?: SkuResponse["status"]
    } = {},
): SkuResponse {
    const { price = 19900, stock = 5, skuCode = null, status = "ON_SALE" } = opts
    const priced = price === null ? null : money(price)
    return {
        id,
        productId: "p1",
        skuCode,
        name: id,
        attributes: attrs.map((value, i) => ({
            attrId: `a${i}`,
            valueId: `v${i}`,
            name: `规格${i}`,
            value,
        })),
        image: null,
        price: priced,
        originalPrice: priced,
        stock,
        status,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
    }
}

function makeRow(
    label: string,
    opts: Partial<Omit<SkuDraftRow, "price">> & { price?: number | null } = {},
): SkuDraftRow {
    const { price, ...rest } = opts
    return {
        skuId: null,
        label,
        price: typeof price === "number" ? money(price) : (price ?? null),
        stock: null,
        skuCode: null,
        status: "ON_SALE",
        ...rest,
    }
}

// ---------- 单元格输入规则（元文本 → Money） ----------

describe("yuanPriceSchema", () => {
    it("合法输入换算成 Money（两位小数内，币种取平台定价币种），首尾空白被裁剪", () => {
        expect(yuanPriceSchema.parse("12.34")).toEqual(money(1234))
        expect(yuanPriceSchema.parse("0.1")).toEqual(money(10))
        expect(yuanPriceSchema.parse("0")).toEqual(money(0))
        expect(yuanPriceSchema.parse("0.00")).toEqual(money(0))
        expect(yuanPriceSchema.parse("  5  ")).toEqual(money(500))
    })

    it("非法格式被拒：负数/超两位小数/科学计数/纯符号", () => {
        expect(yuanPriceSchema.safeParse("-5").success).toBe(false)
        expect(yuanPriceSchema.safeParse("12.345").success).toBe(false)
        expect(yuanPriceSchema.safeParse("1e3").success).toBe(false)
        expect(yuanPriceSchema.safeParse("abc").success).toBe(false)
        expect(yuanPriceSchema.safeParse(".5").success).toBe(false)
    })

    it("空串/纯空白由调用方先判为清空（不进 schema）", () => {
        expect(yuanPriceSchema.safeParse("").success).toBe(false)
        expect(yuanPriceSchema.safeParse("   ").success).toBe(false)
    })
})

describe("countInputSchema", () => {
    it("非负整数直接换算", () => {
        expect(countInputSchema.parse("12")).toBe(12)
        expect(countInputSchema.parse("0")).toBe(0)
    })

    it("负数/小数/非数字被拒", () => {
        expect(countInputSchema.safeParse("-1").success).toBe(false)
        expect(countInputSchema.safeParse("1.5").success).toBe(false)
        expect(countInputSchema.safeParse("abc").success).toBe(false)
    })
})

// ---------- SKU 组合：模板选值 → 笛卡尔积行 ----------

describe("buildSkuRowsFromSelections", () => {
    it("无任何选值时生成单规格一行", () => {
        const rows = buildSkuRowsFromSelections([makeNode("a1", "颜色", ["红"])], [])

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ label: "单规格", skuId: null, status: "ON_SALE" })
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

    it("生成的行全部是未设价/未填库存的新建态", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0"])])

        expect(rows[0]).toMatchObject({ skuId: null, price: null, stock: null, skuCode: null })
    })
})

// ---------- wire → 可编辑行 ----------

describe("rowFromSku", () => {
    it("label 按属性值拼接；金额原样透传 Money（不做分/元互转），库存透传", () => {
        const row = rowFromSku(makeSku("s1", ["红", "M"], { price: 19900, stock: 3 }))

        expect(row).toMatchObject({
            skuId: "s1",
            label: "红 / M",
            price: money(19900),
            stock: 3,
        })
    })

    it("无属性的 SKU 是单规格行", () => {
        expect(rowFromSku(makeSku("s1", [])).label).toBe("单规格")
    })

    it("价格为 null 时行内也是 null（未设价 ≠ 0 元，不在边界之外归一）", () => {
        expect(rowFromSku(makeSku("s1", ["红"], { price: null })).price).toBeNull()
    })

    it("DISABLED 保留，其余状态归一为 ON_SALE", () => {
        expect(rowFromSku(makeSku("s1", [], { status: "DISABLED" })).status).toBe("DISABLED")
        expect(rowFromSku(makeSku("s1", [])).status).toBe("ON_SALE")
    })

    it("skuCode null 原样透传（省略发生在 wire 投影边界）", () => {
        expect(rowFromSku(makeSku("s1", [])).skuCode).toBeNull()
    })
})

// ---------- 对账合并（编辑态按稳定 skuId 保留已填值） ----------

describe("mergeSkuRows", () => {
    it("组合没变（skuId 稳定）时带回上一轮已填的价格/库存/编码", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500, stock: 9, skuCode: "C1" })]
        const fresh = [makeSku("s1", ["红"], { price: 19900, stock: 5, skuCode: null })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            price: money(2500),
            stock: 9,
            skuCode: "C1",
        })
    })

    it("上一轮没填过的字段（null）用服务端回填值，不用 null 覆盖真值", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500 })]
        const fresh = [makeSku("s1", ["红"], { stock: 5 })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            price: money(2500),
            stock: 5,
        })
    })

    it("显式填过 0 元也算已填（null 比较而不是 truthiness，0 不会被服务端值吞掉）", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 0 })]
        const fresh = [makeSku("s1", ["红"], { price: 19900 })]

        expect(mergeSkuRows(previous, fresh)[0]?.price).toEqual(money(0))
    })

    it("新组合（无 skuId 匹配）不残留旧行数据", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500 })]
        const fresh = [makeSku("s2", ["蓝"])]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({ skuId: "s2", price: money(19900) })
    })

    it("上一轮为空时全部用服务端行", () => {
        const fresh = [makeSku("s1", ["红"])]

        expect(mergeSkuRows(undefined, fresh)[0]).toMatchObject({ price: money(19900), stock: 5 })
    })
})

// ---------- 保存合并（新建态按 label 搬回已填值） ----------

describe("mergeLocalPricedRows", () => {
    it("新建态按 label 匹配，把本地已填值搬回带 skuId 的服务端行", () => {
        const local = [makeRow("红 / M", { price: 2500, stock: 9 })]
        const serverRows = [makeRow("红 / M", { skuId: "s1", price: 19900, stock: 5 })]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            skuId: "s1",
            price: money(2500),
            stock: 9,
        })
    })

    it("本地没填（null）的字段保留服务端值", () => {
        const local = [makeRow("红", { price: 2500 })]
        const serverRows = [makeRow("红", { skuId: "s1", price: 19900, stock: 5, skuCode: "C1" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            price: money(2500),
            stock: 5,
            skuCode: "C1",
        })
    })

    it("状态跟随本地行（服务端新行默认态被覆盖）", () => {
        const local = [makeRow("红", { price: 2500, status: "DISABLED" })]
        const serverRows = [makeRow("红", { skuId: "s1" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]?.status).toBe("DISABLED")
    })

    it("本地没有的组合原样保留服务端行", () => {
        const serverRows = [makeRow("蓝", { skuId: "s2", price: 19900 })]

        expect(mergeLocalPricedRows([], serverRows)[0]).toMatchObject({
            skuId: "s2",
            price: money(19900),
        })
    })
})

// ---------- 保存门槛与 wire 载荷 ----------

describe("unpricedRows", () => {
    it("price 为 null 即未设价（0 分是合法价，不算未设）", () => {
        const rows = [
            makeRow("红", { price: 0 }),
            makeRow("蓝"),
            makeRow("绿", { skuId: "s3", price: 19900 }),
        ]

        expect(unpricedRows(rows).map((r) => r.label)).toEqual(["蓝"])
    })
})

describe("toSkuUpdateItems", () => {
    it("只发已建档且已设价的行：空价不发（草稿无门槛的关键，不写 0）", () => {
        const rows = [
            makeRow("单规格", { skuId: "s1", price: 2500, stock: 9 }),
            makeRow("红", { skuId: "s2", price: null }),
            makeRow("蓝"), // 未建档本地行
        ]

        expect(toSkuUpdateItems(rows)).toHaveLength(1)
        expect(toSkuUpdateItems(rows)[0]).toMatchObject({
            skuId: "s1",
            price: money(2500),
            stock: 9,
        })
    })

    it("库存 null → 0（产品决策：没填库存的 SKU 落 0），编码空/空白 → 省略，只在此边界兜底", () => {
        const rows = [makeRow("红", { skuId: "s1", price: 2500, skuCode: "  C1  " })]

        expect(toSkuUpdateItems(rows)[0]).toMatchObject({ skuId: "s1", stock: 0, skuCode: "C1" })
        expect(
            toSkuUpdateItems([makeRow("红", { skuId: "s1", price: 2500, skuCode: "   " })])[0]
                ?.skuCode,
        ).toBeUndefined()
    })
})
