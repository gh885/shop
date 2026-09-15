import { describe, expect, it } from "vitest"

import type { SpecItem } from "@shop/api/sdk"

import type { ProductDetail } from "../product"
import { sameSelection, sanitizeSelection, skuSearchSchema, toggleSelection } from "./sku-search"

/** ProductDetail 可控构造：只有 specs 参与收窄，其余字段给合法默认值 */
const MONEY = { amount: 19900, currency: "CNY" }

function specGroup(name: string, values: string[]): SpecItem {
    return {
        attrId: `a-${name}`,
        name,
        values: values.map((v) => ({ valueId: `v-${v}`, value: v, image: null })),
    }
}

function detailWith(specs: SpecItem[]): ProductDetail {
    return {
        product: {
            id: "p1",
            shopId: "s1",
            categoryId: "c1",
            title: "测试商品",
            subtitle: null,
            image: null,
            priceMin: MONEY,
            priceMax: MONEY,
        },
        detailImages: [],
        images: [],
        specs,
        params: [],
        skus: [],
    }
}

describe("skuSearchSchema", () => {
    it("解析合法 spec", () => {
        expect(skuSearchSchema.parse({ spec: { 颜色: "红" } })).toEqual({ spec: { 颜色: "红" } })
    })

    it("spec 缺失 / 形状不对一律收敛为空对象，不抛错", () => {
        expect(skuSearchSchema.parse({})).toEqual({ spec: {} })
        expect(skuSearchSchema.parse({ spec: "红" })).toEqual({ spec: {} })
        expect(skuSearchSchema.parse({ spec: { 颜色: 1 } })).toEqual({ spec: {} })
    })

    it("忽略额外参数", () => {
        expect(skuSearchSchema.parse({ spec: {}, page: 2 })).toEqual({ spec: {} })
    })
})

describe("sanitizeSelection", () => {
    const detail = detailWith([specGroup("颜色", ["红", "蓝"]), specGroup("尺码", ["M", "L"])])

    it("保留真实存在的维度与值", () => {
        expect(sanitizeSelection(detail, { 颜色: "红", 尺码: "L" })).toEqual({
            颜色: "红",
            尺码: "L",
        })
    })

    it("丢掉已下架的维度与值（否则全部 SKU 都匹配不上，规格会全灰）", () => {
        expect(sanitizeSelection(detail, { 颜色: "已下架的色", 尺码: "L", 已删维度: "x" })).toEqual(
            { 尺码: "L" },
        )
    })

    it("未选的维度不出现在结果里", () => {
        expect(sanitizeSelection(detail, {})).toEqual({})
    })

    it("商品没有任何规格组时一律收窄为空", () => {
        expect(sanitizeSelection(detailWith([]), { 颜色: "红" })).toEqual({})
    })
})

describe("toggleSelection", () => {
    it("选中一个维度", () => {
        expect(toggleSelection({}, "颜色", "红")).toEqual({ 颜色: "红" })
    })

    it("同值再点一次取消该维度，其他维度保留", () => {
        expect(toggleSelection({ 颜色: "红", 尺码: "L" }, "颜色", "红")).toEqual({ 尺码: "L" })
    })

    it("换成同维度的另一个值", () => {
        expect(toggleSelection({ 颜色: "红" }, "颜色", "蓝")).toEqual({ 颜色: "蓝" })
    })

    it("不修改入参", () => {
        const before = { 颜色: "红" }
        toggleSelection(before, "尺码", "L")
        expect(before).toEqual({ 颜色: "红" })
    })
})

describe("sameSelection", () => {
    it("键序不同也算等价", () => {
        expect(sameSelection({ 颜色: "红", 尺码: "L" }, { 尺码: "L", 颜色: "红" })).toBe(true)
    })

    it("少一个维度 / 值不同都算不等价", () => {
        expect(sameSelection({ 颜色: "红" }, { 颜色: "红", 尺码: "L" })).toBe(false)
        expect(sameSelection({ 颜色: "红" }, { 颜色: "蓝" })).toBe(false)
    })

    it("两个空对象等价", () => {
        expect(sameSelection({}, {})).toBe(true)
    })
})
