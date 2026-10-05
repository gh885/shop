import type { CartItemView } from "@shop/api/sdk"
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
} from "./cart"
import { toCartItem } from "./mapper"

/**
 * 测试夹具：CartItemView wire 形状 → CartItem 投影的可控构造。
 * 只暴露测试关心的维度（价格/库存/勾选/失效/店铺），其余字段取合法默认值。
 */
function makeDto(
    opts: {
        id?: string
        price?: number
        stock?: number
        quantity?: number
        selected?: boolean
        available?: boolean
        shopId?: string
        shopName?: string
        mainImage?: string | null
        skuImage?: string | null
        /** 划线价（分）：默认比现价高 10 元；null = 没有划线价，等于现价 = 挂着但不打折 */
        originalPrice?: number | null
        /** 商品/SKU 已被删除：后端连快照都不返回（product 与 sku 同生共死），不是下架 */
        deleted?: boolean
    } = {},
): CartItemView {
    const {
        id = "item-1",
        price = 19900,
        stock = 5,
        quantity = 1,
        selected = true,
        available = true,
        shopId = "shop-1",
        shopName = "数码旗舰店",
        mainImage = null,
        skuImage = null,
        originalPrice = price + 1000,
        deleted = false,
    } = opts
    return {
        id,
        skuId: `sku-${id}`,
        quantity,
        selected,
        available: deleted ? false : available,
        addedAt: "2026-01-01T00:00:00Z",
        product: deleted
            ? null
            : {
                  id: `p-${id}`,
                  name: `商品${id}`,
                  mainImage,
                  shopId,
                  shopName,
              },
        sku: deleted
            ? null
            : {
                  id: `sku-${id}`,
                  name: "默认规格",
                  image: skuImage,
                  price: { amount: price, currency: "CNY" },
                  originalPrice:
                      originalPrice === null ? null : { amount: originalPrice, currency: "CNY" },
                  stock,
                  onSale: available,
              },
    }
}

function items(...dtos: CartItemView[]): CartItem[] {
    return dtos.map(toCartItem)
}

// 派生：选中/合计/全选
describe("deriveSelectedItems / deriveSelectedTotal", () => {
    it("只保留可售且勾选的条目", () => {
        const list = items(
            makeDto({ id: "a" }),
            makeDto({ id: "b", selected: false }),
            makeDto({ id: "c", available: false }),
        )
        expect(deriveSelectedItems(list).map((i) => i.id)).toEqual(["a"])
    })

    it("合计 = 单价 × 数量 逐条累加，币种跟着单价", () => {
        const selected = items(
            makeDto({ id: "a", price: 19900, quantity: 2 }),
            makeDto({ id: "b", price: 550 }),
        )
        expect(deriveSelectedTotal(deriveSelectedItems(selected))).toEqual(money(19900 * 2 + 550))
    })

    it("商品已删的条目即使曾被勾选也不进合计（快照都没了，无价可算）", () => {
        const list = items(makeDto({ id: "a", price: 19900 }), makeDto({ id: "b", deleted: true }))
        expect(deriveSelectedItems(list).map((i) => i.id)).toEqual(["a"])
        expect(deriveSelectedTotal(deriveSelectedItems(list))).toEqual(money(19900))
    })

    it("空列表合计为该币种的零", () => {
        expect(deriveSelectedTotal([])).toEqual(zeroMoney())
    })
})

describe("deriveAllSelected", () => {
    it("全部可售条目都勾选 → true", () => {
        expect(deriveAllSelected(items(makeDto(), makeDto({ id: "b" })))).toBe(true)
    })

    it("部分勾选 → false（不做半选）", () => {
        expect(deriveAllSelected(items(makeDto(), makeDto({ id: "b", selected: false })))).toBe(
            false,
        )
    })

    it("失效条目不参与全选语义", () => {
        const list = items(makeDto(), makeDto({ id: "b", available: false, selected: false }))
        expect(deriveAllSelected(list)).toBe(true)
    })

    it("无可售条目（空车/全部失效）→ false", () => {
        expect(deriveAllSelected([])).toBe(false)
        expect(deriveAllSelected(items(makeDto({ available: false })))).toBe(false)
    })
})

// 派生：分组与条目视图
describe("groupByShop", () => {
    it("按店铺分组且保持服务端返回顺序", () => {
        const list = items(
            makeDto({ id: "a", shopId: "s1" }),
            makeDto({ id: "b", shopId: "s2" }),
            makeDto({ id: "c", shopId: "s1" }),
        )
        const groups = groupByShop(list)
        expect(groups.map((g) => [g.shopId, g.items.map((i) => i.id)])).toEqual([
            ["s1", ["a", "c"]],
            ["s2", ["b"]],
        ])
    })

    it("shopName 为空的失效条目归入「失效商品」组", () => {
        const list = items(
            makeDto({ id: "a" }),
            makeDto({ id: "b", available: false, shopId: "gone-1", shopName: "" }),
        )
        const groups = groupByShop(list)
        expect(groups.map((g) => g.shopNameKey ?? g.shopName)).toEqual([
            "数码旗舰店",
            "web.cart.group.deletedShop",
        ])
    })

    it("商品已删的条目（后端不再给 shopId）聚成同一组，不按店铺散开", () => {
        const list = items(
            makeDto({ id: "a" }),
            makeDto({ id: "b", deleted: true }),
            makeDto({ id: "c", deleted: true }),
        )
        expect(
            groupByShop(list).map((g) => [g.shopNameKey ?? g.shopName, g.items.map((i) => i.id)]),
        ).toEqual([
            ["数码旗舰店", ["a"]],
            ["web.cart.group.deletedShop", ["b", "c"]],
        ])
    })
})

describe("selectableIdsOf", () => {
    it("排除失效条目", () => {
        const [group] = groupByShop(
            items(makeDto({ id: "a" }), makeDto({ id: "b", available: false })),
        )
        expect(selectableIdsOf(group!)).toEqual(["a"]) // 分组结构由 groupByShop 测试保证
    })
})

describe("deriveCartItemView", () => {
    it("图优先取 SKU 图，缺省回退商品主图", () => {
        expect(deriveCartItemView(toCartItem(makeDto({ skuImage: "sku.jpg" }))).image).toBe(
            "sku.jpg",
        )
        expect(
            deriveCartItemView(toCartItem(makeDto({ skuImage: null, shopName: "数码旗舰店" })))
                .image,
        ).toBeUndefined() // 两层都没有 → undefined（占位图）
    })

    it("可售但库存 0 → 缺货（可勾选语义由 available 决定，不 disabled）", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ stock: 0 })))
        expect(view.outOfStock).toBe(true)
        expect(view.disabled).toBe(false)
    })

    it("失效条目 → disabled，且不算缺货（下架 ≠ 缺货）", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ available: false, stock: 0 })))
        expect(view.disabled).toBe(true)
        expect(view.outOfStock).toBe(false)
    })

    it("商品/SKU 已删 → 给失效占位：无价、无 SKU 名、置灰，但仍留一行让买家删得掉", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ deleted: true })))
        expect(view).toMatchObject({
            title: "",
            titleKey: "web.cart.item.deletedTitle",
            disabled: true,
            stock: 0,
        })
        expect(view.price).toBeUndefined()
        expect(view.original).toBeUndefined()
        expect(view.skuName).toBeUndefined()
    })

    it("现价来自 SKU，划线价高于现价才留：让过的钱才配一条删除线", () => {
        expect(deriveCartItemView(toCartItem(makeDto({ price: 19900 }))).price).toEqual(
            money(19900),
        )
        expect(deriveCartItemView(toCartItem(makeDto({ price: 19900 }))).original).toEqual(
            money(20900),
        )
    })

    it("划线价与现价相等 ⇒ 不画：那是「没打折」，画出来就成了假折扣", () => {
        const view = deriveCartItemView(toCartItem(makeDto({ price: 19900, originalPrice: 19900 })))
        expect(view.price).toEqual(money(19900))
        expect(view.original).toBeUndefined()
    })

    it("契约里没有划线价 ⇒ 视图里也没有（后端允许 originalPrice 为 null）", () => {
        expect(
            deriveCartItemView(toCartItem(makeDto({ price: 19900, originalPrice: null }))).original,
        ).toBeUndefined()
    })
})

// 缓存变换语义
describe("patchItem / setItemsSelected / removeItems", () => {
    const list = items(makeDto({ id: "a" }), makeDto({ id: "b" }), makeDto({ id: "c" }))

    it("patchItem 只改目标条目，不触碰其余与原数组", () => {
        const next = patchItem(list, "b", { selected: false, quantity: 3 })
        expect(next.find((i) => i.id === "b")).toMatchObject({ selected: false, quantity: 3 })
        expect(next.find((i) => i.id === "a")?.quantity).toBe(1)
        expect(list.find((i) => i.id === "b")?.quantity).toBe(1) // 原数组不可变
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
