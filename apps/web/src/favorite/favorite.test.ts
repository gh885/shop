import type { FavoriteItemView } from "@shop/api/sdk"
import { describe, expect, it } from "vite-plus/test"

import {
    collectCount,
    dropSelection,
    EMPTY_SELECTION,
    filterFavorites,
    pickAllSelection,
    toggleSelection,
} from "./favorite"
import { toFavoriteItem } from "./mapper"

/**
 * 测试夹具：FavoriteItemView wire 形状可控构造。
 * 关心维度：available、name/mainImage/minPrice 投影、collectCount。
 */
function makeDto(
    opts: { available?: boolean; name?: string; mainImage?: string | null } = {},
): FavoriteItemView {
    return {
        id: "fav-1",
        productId: "p-1",
        favoritedAt: "2026-09-01T00:00:00Z",
        available: opts.available ?? true,
        product: {
            id: "p-1",
            name: opts.name ?? "测试商品",
            mainImage: opts.mainImage ?? null,
            minPrice: { amount: 19900, currency: "CNY" },
            maxPrice: { amount: 29900, currency: "CNY" },
            collectCount: 12,
        },
    }
}

describe("filterFavorites", () => {
    const favorites = [
        toFavoriteItem(makeDto({ name: "复古台灯" })),
        toFavoriteItem(makeDto({ name: "北欧沙发" })),
    ]

    it("关键词命中标题（大小写不敏感）", () => {
        expect(filterFavorites(favorites, "台灯")).toHaveLength(1)
        expect(filterFavorites(favorites, "LED")).toHaveLength(0)
    })

    it("空白关键词返回全部条目", () => {
        expect(filterFavorites(favorites, "  ")).toHaveLength(2)
    })
})

/**
 * 收藏数的折位文本。**「N 人收藏」那句已经不在这一层**（进catalog 的 `web.favorite.collected`，
 * 由 FavoriteCard 用 t() 拼）——这里只钉折位数字的接线，折位口径本身在 common 的 compactCount。
 */
describe("collectCount", () => {
    it("只给折后的数字，句子归调用方（万以下原样、过万折）", () => {
        expect(collectCount(12, "zh-CN")).toBe("12")
        expect(collectCount(10000, "zh-CN")).toBe("1万")
        expect(collectCount(10000, "en-US")).toBe("10K")
    })
})

/**
 * 勾选集合的三条转移。值得单独测的是「什么时候不换引用」：
 * 无关的一次 setState 若换掉整个 Set，收藏页每张卡片都会跟着重渲染。
 */
describe("批量选择转移", () => {
    it("点选未选中的商品_加进集合", () => {
        expect([...toggleSelection(EMPTY_SELECTION, "p-1")]).toEqual(["p-1"])
    })

    it("再点一次_取消选择，其余勾选不动", () => {
        const picked = toggleSelection(toggleSelection(EMPTY_SELECTION, "p-1"), "p-2")
        expect([...toggleSelection(picked, "p-1")]).toEqual(["p-2"])
    })

    it("商品被移出收藏后它的勾选一并作废_没勾过它就返回同一个引用", () => {
        const picked = toggleSelection(EMPTY_SELECTION, "p-1")
        expect([...dropSelection(picked, "p-1")]).toEqual([])
        const untouched = dropSelection(picked, "p-9")
        expect(untouched).toBe(picked)
    })

    it("全选吃当前筛选结果_关键词过滤掉的商品不会被顺手选中", () => {
        const items = [{ productId: "p-1" }, { productId: "p-2" }]
        expect(pickAllSelection(items, true)).toEqual(new Set(["p-1", "p-2"]))
        expect(pickAllSelection(items, false)).toBe(EMPTY_SELECTION)
    })
})
