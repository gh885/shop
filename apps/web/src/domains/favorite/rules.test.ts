import type { FavoriteLine } from "@shop/api/sdk"
import { describe, expect, it } from "vite-plus/test"

import { EMPTY_SELECTION } from "./constants"
import { dropSelection, filterFavorites, pickAllSelection, toggleSelection } from "./rules"
import { toFavoriteItem } from "./mapper"

function makeDto(
    opts: { available?: boolean; name?: string; imageUrl?: string | null } = {},
): FavoriteLine {
    return {
        spuId: "p-1",
        title: opts.name ?? "测试商品",
        imageUrl: opts.imageUrl ?? "",
        price: { amount: 19900, currency: "CNY" },
        available: opts.available ?? true,
        favoritedAt: "2026-09-01T00:00:00Z",
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
        const items = [{ spuId: "p-1" }, { spuId: "p-2" }]
        expect(pickAllSelection(items, true)).toEqual(new Set(["p-1", "p-2"]))
        expect(pickAllSelection(items, false)).toBe(EMPTY_SELECTION)
    })
})
