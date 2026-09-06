import type { FavoriteListItemResponse } from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import { collectText, filterFavorites, toFavoriteItem } from "./favorite"

/**
 * 测试夹具：FavoriteListItemResponse wire 形状可控构造。
 * 关心维度：available、name/mainImage/minPrice 投影、collectCount。
 */
function makeDto(
    opts: { available?: boolean; name?: string; mainImage?: string | null } = {},
): FavoriteListItemResponse {
    return {
        id: "fav-1",
        productId: "p-1",
        favoritedAt: "2026-09-01T00:00:00Z",
        available: opts.available ?? true,
        product: {
            name: opts.name ?? "测试商品",
            mainImage: opts.mainImage ?? null,
            minPrice: { amount: 19900, currency: "CNY" },
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
    it("万级转 x.x万、千级转 x.x千、其余原样", () => {
        expect(collectText(12)).toBe("12人收藏")
        expect(collectText(999)).toBe("999人收藏")
        expect(collectText(1234)).toBe("1.2千人收藏")
        expect(collectText(23456)).toBe("2.3万人收藏")
    })
})
