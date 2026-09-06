import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ProductDetail, Sku } from "../product"

import { useSkuSelection } from "./use-sku-selection"

/**
 * 测试夹具：ProductDetail 可控构造。只暴露测试关心的维度（SKU 属性组合/库存/规格组），
 * 其余字段取合法默认值。金额固定 19900 分、CNY。
 */
const MONEY = { amount: 19900, currency: "CNY" }

function makeSku(attrs: Array<[string, string]>, opts: { stock?: number; id?: string } = {}): Sku {
    const { stock = 5, id = attrs.map((a) => a.join(":")).join("/") } = opts
    return {
        id,
        name: id,
        attributes: attrs.map(([name, value]) => ({
            attrId: `a-${name}`,
            valueId: `v-${value}`,
            name,
            value,
        })),
        image: null,
        price: MONEY,
        originalPrice: MONEY,
        stock,
    }
}

function makeDetail(
    skus: Sku[],
    specs: Array<{ name: string; values: string[] }> = [],
): ProductDetail {
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
        specs: specs.map((s) => ({
            attrId: `a-${s.name}`,
            name: s.name,
            values: s.values.map((v) => ({ valueId: `v-${v}`, value: v, image: null })),
        })),
        params: [],
        skus,
    }
}

describe("useSkuSelection", () => {
    const skus = [
        makeSku(
            [
                ["颜色", "红"],
                ["尺码", "M"],
            ],
            { stock: 0 },
        ),
        makeSku(
            [
                ["颜色", "红"],
                ["尺码", "L"],
            ],
            { stock: 3 },
        ),
        makeSku(
            [
                ["颜色", "蓝"],
                ["尺码", "M"],
            ],
            { stock: 2 },
        ),
    ]

    it("点选一个维度即命中首个满足已选维度的 SKU，选全后命中精确 SKU", () => {
        const { result } = renderHook(() => useSkuSelection(makeDetail(skus)))

        act(() => result.current.select("颜色", "蓝"))
        // 部分选择不猜测：只要求已选维度命中 → 先命中「蓝 M」
        expect(result.current.matchedSku?.id).toBe("颜色:蓝/尺码:M")

        act(() => result.current.select("尺码", "L"))
        // 蓝 L 组合不存在 → 不命中
        expect(result.current.matchedSku).toBeUndefined()

        act(() => result.current.select("颜色", "红"))
        expect(result.current.matchedSku?.id).toBe("颜色:红/尺码:L")
    })

    it("再点一次同值会取消该维度的选择", () => {
        const { result } = renderHook(() => useSkuSelection(makeDetail(skus)))

        act(() => result.current.select("颜色", "红"))
        act(() => result.current.select("颜色", "红"))

        expect(result.current.selection).toEqual({})
        expect(result.current.matchedSku).toBeUndefined()
    })

    it("已选维度会约束其他维度的可选性：库存为 0 的组合被置灰", () => {
        const { result } = renderHook(() => useSkuSelection(makeDetail(skus)))

        act(() => result.current.select("尺码", "M"))
        // 红 M 库存 0 → 不可选；蓝 M 库存 2 → 可选
        expect(result.current.isAvailable("颜色", "红")).toBe(false)
        expect(result.current.isAvailable("颜色", "蓝")).toBe(true)
    })

    it("库存判断不受本维度当前已选值的干扰", () => {
        const { result } = renderHook(() => useSkuSelection(makeDetail(skus)))

        act(() => result.current.select("颜色", "红"))
        // 红本身库存情况不影响其他维度求值：红 L 有货 → L 可选
        expect(result.current.isAvailable("尺码", "L")).toBe(true)
    })

    it("全部 SKU 售罄时任何值都不可选", () => {
        const soldOut = [
            makeSku([["颜色", "红"]], { stock: 0 }),
            makeSku([["颜色", "蓝"]], { stock: 0 }),
        ]
        const { result } = renderHook(() => useSkuSelection(makeDetail(soldOut)))

        expect(result.current.isAvailable("颜色", "红")).toBe(false)
        expect(result.current.isAvailable("颜色", "蓝")).toBe(false)
    })

    it("详情未加载时不命中任何 SKU，也不会崩溃", () => {
        const { result } = renderHook(() => useSkuSelection(undefined))

        expect(result.current.matchedSku).toBeUndefined()
        expect(result.current.isAvailable("颜色", "红")).toBe(false)
    })
})
