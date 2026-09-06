import type { SkuResponse } from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import {
    mergeLocalPricedRows,
    mergeSkuRows,
    rowFromSku,
    type SkuDraftRow,
} from "./product-form-state"

/**
 * 测试夹具：SkuResponse / SkuDraftRow 可控构造。
 * 关心维度：组合 label（attributes 拼接）、价格分/是否为 null、库存、编码、状态。
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
        price,
        originalPrice: price,
        currency: "CNY",
        stock,
        status,
        createdAt: "2026-01-01T00:00:00Z",
    }
}

function makeRow(label: string, opts: Partial<SkuDraftRow> = {}): SkuDraftRow {
    return {
        skuId: "",
        label,
        priceText: "",
        stockText: "",
        skuCode: "",
        status: "ON_SALE",
        ...opts,
    }
}

describe("rowFromSku", () => {
    it("价格分转元字符串，库存转字符串，label 按属性值拼接", () => {
        const row = rowFromSku(makeSku("s1", ["红", "M"], { price: 19900, stock: 3 }))

        expect(row).toMatchObject({
            skuId: "s1",
            label: "红 / M",
            priceText: "199.00",
            stockText: "3",
        })
    })

    it("无属性的 SKU 是单规格行", () => {
        expect(rowFromSku(makeSku("s1", [])).label).toBe("单规格")
    })

    it("价格为 null 时留空而不是 0（未设价 ≠ 0 元）", () => {
        const row = rowFromSku(makeSku("s1", ["红"], { price: null }))

        expect(row.priceText).toBe("")
    })

    it("DISABLED 保留，其余状态归一为 ON_SALE", () => {
        expect(rowFromSku(makeSku("s1", [], { status: "DISABLED" })).status).toBe("DISABLED")
        expect(rowFromSku(makeSku("s1", [])).status).toBe("ON_SALE")
    })

    it("skuCode 为 null 时归一为空串", () => {
        expect(rowFromSku(makeSku("s1", [])).skuCode).toBe("")
    })
})

describe("mergeSkuRows", () => {
    it("组合没变（skuId 稳定）时带回上一轮已填的价格/库存/编码", () => {
        const previous = [
            makeRow("红", { skuId: "s1", priceText: "25.00", stockText: "9", skuCode: "C1" }),
        ]
        const fresh = [makeSku("s1", ["红"], { price: 19900, stock: 5, skuCode: null })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            priceText: "25.00",
            stockText: "9",
            skuCode: "C1",
        })
    })

    it("上一轮没填过的字段用服务端回填值，不带上来的空值覆盖真值", () => {
        const previous = [makeRow("红", { skuId: "s1", priceText: "25.00" })]
        const fresh = [makeSku("s1", ["红"], { stock: 5 })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            priceText: "25.00",
            stockText: "5",
        })
    })

    it("新组合（无 skuId 匹配）不残留旧行数据", () => {
        const previous = [makeRow("红", { skuId: "s1", priceText: "25.00" })]
        const fresh = [makeSku("s2", ["蓝"])]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({ skuId: "s2", priceText: "199.00" })
    })

    it("上一轮为空时全部用服务端行", () => {
        const fresh = [makeSku("s1", ["红"])]

        expect(mergeSkuRows(undefined, fresh)[0]).toMatchObject({
            skuId: "s1",
            priceText: "199.00",
        })
    })
})

describe("mergeLocalPricedRows", () => {
    it("新建态按 label 匹配，把本地已填值搬回带 skuId 的服务端行", () => {
        const local = [makeRow("红 / M", { priceText: "25.00", stockText: "9" })]
        const serverRows = [makeRow("红 / M", { skuId: "s1", priceText: "199.00", stockText: "5" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            skuId: "s1",
            priceText: "25.00",
            stockText: "9",
        })
    })

    it("本地没填的字段保留服务端值", () => {
        const local = [makeRow("红", { priceText: "25.00" })]
        const serverRows = [
            makeRow("红", { skuId: "s1", priceText: "199.00", stockText: "5", skuCode: "C1" }),
        ]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            priceText: "25.00",
            stockText: "5",
            skuCode: "C1",
        })
    })

    it("状态跟随本地行（服务端新行默认态被覆盖）", () => {
        const local = [makeRow("红", { priceText: "25.00", status: "DISABLED" })]
        const serverRows = [makeRow("红", { skuId: "s1" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]?.status).toBe("DISABLED")
    })

    it("本地没有的组合原样保留服务端行", () => {
        const serverRows = [makeRow("蓝", { skuId: "s2", priceText: "199.00" })]

        expect(mergeLocalPricedRows([], serverRows)[0]).toMatchObject({
            skuId: "s2",
            priceText: "199.00",
        })
    })
})
