import type { FavoriteItemView } from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import { collectText, filterFavorites, toFavoriteItem } from "./favorite"

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

describe("toFavoriteItem", () => {
    it("name→title、mainImage→image、minPrice→price 投影到位", () => {
        const item = toFavoriteItem(makeDto({ name: "复古台灯", mainImage: "img/a.png" }))

        expect(item).toMatchObject({
            productId: "p-1",
            title: "复古台灯",
            image: "img/a.png",
            price: { amount: 19900, currency: "CNY" },
        })
    })

    it("主图 null 归一为 undefined；下架商品 available=false 由渲染层置灰", () => {
        const item = toFavoriteItem(makeDto({ available: false }))

        expect(item.image).toBeUndefined()
        expect(item.available).toBe(false)
    })
})

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

describe("collectText", () => {
    it("折万口径与销量同一份：万以下原样，整万去尾", () => {
        expect(collectText(12)).toBe("12人收藏")
        expect(collectText(999)).toBe("999人收藏")
        // 千级不再折「1.2千」：同一张卡片上「已售 1234」和收藏数各折各的，是两份口径的现场
        expect(collectText(1234)).toBe("1234人收藏")
        expect(collectText(10000)).toBe("1万人收藏")
        expect(collectText(23456)).toBe("2.3万人收藏")
    })
})
