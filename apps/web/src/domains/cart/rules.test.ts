import type { CartLine } from "@shop/api/sdk"
import { money, zeroMoney } from "@shop/common/domain"
import { describe, expect, it } from "vite-plus/test"

import {
    deriveAllSelected,
    deriveCartItemView,
    deriveSelectedItems,
    deriveSelectedTotal,
    groupByShop,
    patchItem,
    removeItems,
    selectableIdsOf,
    setItemsSelected,
    type CartItem,
} from "./rules"
import { toCartItem } from "./mapper"

function makeDto(
    opts: {
        skuId?: string
        price?: number
        quantity?: number
        selected?: boolean
        available?: boolean
        shopId?: string
        shopName?: string
        imageUrl?: string | null
        title?: string
        deleted?: boolean
    } = {},
): CartLine {
    const {
        skuId = "sku-a",
        price = 19900,
        quantity = 1,
        selected = true,
        available = true,
        shopId = "shop-1",
        shopName = "数码旗舰店",
        imageUrl = null,
        title,
        deleted = false,
    } = opts
    return {
        skuId,
        quantity,
        selected,
        addedAt: "2026-01-01T00:00:00Z",
        available: deleted ? false : available,
        unavailableReason: deleted ? "SKU_UNAVAILABLE" : "OK",
        sku: {
            spuId: `spu-${skuId}`,
            listingId: `listing-${skuId}`,
            merchantId: "merchant-1",
            shopId,
            shopName,
            title: title ?? `商品${skuId}`,
            imageUrl: imageUrl ?? "",
            specValuesJson: "",
            price: { amount: price, currency: "CNY" },
        },
    }
}

function items(...dtos: CartLine[]): CartItem[] {
    return dtos.map(toCartItem)
}

describe("deriveSelectedItems / deriveSelectedTotal", () => {
    it("只保留可售且勾选的条目", () => {
        const list = items(
            makeDto({ skuId: "a" }),
            makeDto({ skuId: "b", selected: false }),
            makeDto({ skuId: "c", available: false }),
        )
        expect(deriveSelectedItems(list).map((i) => i.id)).toEqual(["a"])
    })

    it("合计 = 单价 × 数量 逐条累加，币种跟着单价", () => {
        const selected = items(
            makeDto({ skuId: "a", price: 19900, quantity: 2 }),
            makeDto({ skuId: "b", price: 550 }),
        )
        expect(deriveSelectedTotal(deriveSelectedItems(selected))).toEqual(money(19900 * 2 + 550))
    })

    it("商品已删的条目即使曾被勾选也不进合计（快照都没了，无价可算）", () => {
        const list = items(
            makeDto({ skuId: "a", price: 19900 }),
            makeDto({ skuId: "b", deleted: true }),
        )
        expect(deriveSelectedItems(list).map((i) => i.id)).toEqual(["a"])
        expect(deriveSelectedTotal(deriveSelectedItems(list))).toEqual(money(19900))
    })

    it("空列表合计为该币种的零", () => {
        expect(deriveSelectedTotal([])).toEqual(zeroMoney())
    })
})

describe("deriveAllSelected", () => {
    it("全部可售条目都勾选 → true", () => {
        expect(deriveAllSelected(items(makeDto(), makeDto({ skuId: "b" })))).toBe(true)
    })

    it("部分勾选 → false（不做半选）", () => {
        expect(deriveAllSelected(items(makeDto(), makeDto({ skuId: "b", selected: false })))).toBe(
            false,
        )
    })

    it("失效条目不参与全选语义", () => {
        const list = items(makeDto(), makeDto({ skuId: "b", available: false, selected: false }))
        expect(deriveAllSelected(list)).toBe(true)
    })

    it("无可售条目（空车/全部失效）→ false", () => {
        expect(deriveAllSelected([])).toBe(false)
        expect(deriveAllSelected(items(makeDto({ available: false })))).toBe(false)
    })
})

describe("groupByShop", () => {
    it("按店铺分组且保持服务端返回顺序", () => {
        const list = items(
            makeDto({ skuId: "a", shopId: "s1" }),
            makeDto({ skuId: "b", shopId: "s2" }),
            makeDto({ skuId: "c", shopId: "s1" }),
        )
        const groups = groupByShop(list)
        expect(groups.map((g) => [g.shopId, g.items.map((i) => i.id)])).toEqual([
            ["s1", ["a", "c"]],
            ["s2", ["b"]],
        ])
    })

    it("shopName 为空的失效条目归入「失效商品」组", () => {
        const list = items(
            makeDto({ skuId: "a" }),
            makeDto({ skuId: "b", available: false, shopId: "gone-1", shopName: "" }),
        )
        const groups = groupByShop(list)
        expect(groups.map((g) => g.shopNameKey ?? g.shopName)).toEqual([
            "数码旗舰店",
            "cart.group.deletedShop",
        ])
    })

    it("商品已删的条目（后端不再给 sku）聚成同一组，不按店铺散开", () => {
        const list = items(
            makeDto({ skuId: "a" }),
            makeDto({ skuId: "b", deleted: true }),
            makeDto({ skuId: "c", deleted: true }),
        )
        expect(
            groupByShop(list).map((g) => [g.shopNameKey ?? g.shopName, g.items.map((i) => i.id)]),
        ).toEqual([
            ["数码旗舰店", ["a"]],
            ["cart.group.deletedShop", ["b", "c"]],
        ])
    })
})

describe("selectableIdsOf", () => {
    it("排除失效条目", () => {
        const [group] = groupByShop(
            items(makeDto({ skuId: "a" }), makeDto({ skuId: "b", available: false })),
        )
        expect(selectableIdsOf(group!)).toEqual(["a"])
    })
})

describe("deriveCartItemView", () => {
    it("图取 SKU 图，没有就是没有（契约不再给商品主图回退）", () => {
        expect(deriveCartItemView(toCartItem(makeDto({ imageUrl: "sku.jpg" }))).image).toBe(
            "sku.jpg",
        )
        expect(deriveCartItemView(toCartItem(makeDto({ imageUrl: null }))).image).toBeUndefined()
    })

    it("失效条目 → disabled 且算缺货（契约只有 available，没有库存数）", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ available: false })))
        expect(view.disabled).toBe(true)
        expect(view.outOfStock).toBe(true)
    })

    it("商品/SKU 已删 → 给失效占位：无价、无 SKU 名、置灰，但仍留一行让买家删得掉", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ deleted: true })))
        expect(view).toMatchObject({
            title: "",
            titleKey: "cart.item.deletedTitle",
            disabled: true,
        })
        expect(view.price).toBeUndefined()
        expect(view.skuName).toBeUndefined()
    })

    it("现价来自 SKU 的 price", () => {
        expect(deriveCartItemView(toCartItem(makeDto({ price: 19900 }))).price).toEqual(
            money(19900),
        )
    })
})

describe("patchItem / setItemsSelected / removeItems", () => {
    const list = items(makeDto({ skuId: "a" }), makeDto({ skuId: "b" }), makeDto({ skuId: "c" }))

    it("patchItem 只改目标条目，不触碰其余与原数组", () => {
        const next = patchItem(list, "b", { selected: false, quantity: 3 })
        expect(next.find((i) => i.id === "b")).toMatchObject({ selected: false, quantity: 3 })
        expect(next.find((i) => i.id === "a")?.quantity).toBe(1)
        expect(list.find((i) => i.id === "b")?.quantity).toBe(1)
    })

    it("setItemsSelected：itemIds 省略 = 整车；传列表 = 只动列表内", () => {
        expect(setItemsSelected(list, undefined, false).every((i) => !i.selected)).toBe(true)
        const next = setItemsSelected(list, ["a", "c"], false)
        expect(next.map((i) => i.selected)).toEqual([false, true, false])
    })

    it("removeItems 过滤指定 id", () => {
        expect(removeItems(list, ["a", "c"]).map((i) => i.id)).toEqual(["b"])
    })
})
