import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { SpecItem } from "@shop/api/sdk"

import type { ProductDetail, Sku, SkuSelection } from "../product"
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

/**
 * 规格组由 SKU 属性去重而来 —— 与后端 `ProductDetail.specs` 的来源一致。
 * 收窄（sanitizeSelection）以 specs 为权威，所以夹具必须给出 specs，
 * 否则「有 SKU 属性但没声明规格组」这种 UI 上不可能出现的退化输入会误伤用例。
 */
function specsOf(skus: Sku[]): SpecItem[] {
    const groups = new Map<string, Set<string>>()
    for (const sku of skus) {
        for (const a of sku.attributes) {
            const values = groups.get(a.name) ?? new Set<string>()
            values.add(a.value)
            groups.set(a.name, values)
        }
    }
    return [...groups].map(([name, values]) => ({
        attrId: `a-${name}`,
        name,
        values: [...values].map((v) => ({ valueId: `v-${v}`, value: v, image: null })),
    }))
}

function makeDetail(skus: Sku[]): ProductDetail {
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
            soldCount: 0,
        },
        sevenDayReturn: true,
        detailImages: [],
        images: [],
        specs: specsOf(skus),
        params: [],
        skus,
    }
}

type SpecChangeHandler = (next: SkuSelection, options: { replace: boolean }) => void

/**
 * 装配被测 hook：`spec` 是 URL 状态的替身，`onSpecChange` 是导航的替身。
 * hook 本身不碰路由（导航由 route 注入），所以这里不需要 Router 上下文。
 */
function setup(detail: ProductDetail, initialSpec: SkuSelection = {}) {
    const onSpecChange = vi.fn<SpecChangeHandler>()
    const view = renderHook(
        ({ spec }: { spec: SkuSelection }) => useSkuSelection({ detail, spec, onSpecChange }),
        { initialProps: { spec: initialSpec } },
    )

    /** 最近一次上报的变更；没有则抛错，避免断言在 undefined 上悄悄通过 */
    function lastChange(): { next: SkuSelection; replace: boolean } {
        const call = onSpecChange.mock.calls.at(-1)
        if (!call) throw new Error("select 没有上报 spec 变更")
        return { next: call[0], replace: call[1].replace }
    }

    /** 点选 + 完成一次「URL 落地」：真实链路里 push 之后 search 变成新值、组件重渲染 */
    function selectAndCommit(specName: string, value: string) {
        act(() => view.result.current.select(specName, value))
        const { next } = lastChange()
        act(() => view.rerender({ spec: next }))
        return next
    }

    return { ...view, onSpecChange, lastChange, selectAndCommit }
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
        const { result, selectAndCommit } = setup(makeDetail(skus))

        selectAndCommit("颜色", "蓝")
        // 部分选择不猜测：只要求已选维度命中 → 先命中「蓝 M」
        expect(result.current.matchedSku?.id).toBe("颜色:蓝/尺码:M")

        selectAndCommit("尺码", "L")
        // 蓝 L 组合不存在 → 不命中
        expect(result.current.matchedSku).toBeUndefined()

        selectAndCommit("颜色", "红")
        expect(result.current.matchedSku?.id).toBe("颜色:红/尺码:L")
    })

    it("再点一次同值会取消该维度的选择", () => {
        const { result, selectAndCommit } = setup(makeDetail(skus))

        selectAndCommit("颜色", "红")
        selectAndCommit("颜色", "红")

        expect(result.current.selection).toEqual({})
        expect(result.current.matchedSku).toBeUndefined()
    })

    it("已选维度会约束其他维度的可选性：库存为 0 的组合被置灰", () => {
        const { result, selectAndCommit } = setup(makeDetail(skus))

        selectAndCommit("尺码", "M")
        // 红 M 库存 0 → 不可选；蓝 M 库存 2 → 可选
        expect(result.current.isAvailable("颜色", "红")).toBe(false)
        expect(result.current.isAvailable("颜色", "蓝")).toBe(true)
    })

    it("库存判断不受本维度当前已选值的干扰", () => {
        const { result, selectAndCommit } = setup(makeDetail(skus))

        selectAndCommit("颜色", "红")
        // 红本身库存情况不影响其他维度求值：红 L 有货 → L 可选
        expect(result.current.isAvailable("尺码", "L")).toBe(true)
    })

    it("全部 SKU 售罄时任何值都不可选", () => {
        const soldOut = [
            makeSku([["颜色", "红"]], { stock: 0 }),
            makeSku([["颜色", "蓝"]], { stock: 0 }),
        ]
        const { result } = setup(makeDetail(soldOut))

        expect(result.current.isAvailable("颜色", "红")).toBe(false)
        expect(result.current.isAvailable("颜色", "蓝")).toBe(false)
    })

    it("用户点击以 push 上报（replace 为 false），后退才能撤回一次选择", () => {
        const { selectAndCommit, lastChange } = setup(makeDetail(skus))

        selectAndCommit("颜色", "红")

        expect(lastChange().replace).toBe(false)
    })

    it("URL 里已有的规格直接生效（刷新/分享链接不丢选中态）", () => {
        const { result, onSpecChange } = setup(makeDetail(skus), { 颜色: "红", 尺码: "L" })

        expect(result.current.selection).toEqual({ 颜色: "红", 尺码: "L" })
        expect(result.current.matchedSku?.id).toBe("颜色:红/尺码:L")
        // 合法 URL 不该触发自愈
        expect(onSpecChange).not.toHaveBeenCalled()
    })

    it("脏 URL 被收窄，并以 replace 自愈一次（不进历史）", () => {
        const { result, lastChange } = setup(makeDetail(skus), { 颜色: "已下架的色", 尺码: "L" })

        expect(result.current.selection).toEqual({ 尺码: "L" })
        expect(lastChange()).toEqual({ next: { 尺码: "L" }, replace: true })
    })

    it("自愈后不再重复上报（同一份脏 spec 只修一次）", () => {
        const { onSpecChange } = setup(makeDetail(skus), { 已删维度: "x" })

        expect(onSpecChange).toHaveBeenCalledTimes(1)
    })
})
