import { AddCartItemRequestSchema } from "@shop/api/schemas"
import type { CartLine, SkuInfo } from "@shop/api/sdk"
import { type Money, sumMoney, timesMoney } from "@shop/common/domain"

/** 购物车行的本地形状：契约 `CartLine` 直接用，id 用 skuId（新契约里没有独立行 id） */
export type CartItem = CartLine & {
    id: string
    skuId: string
    quantity: number
    selected: boolean
    available: boolean
}

export type SellableCartItem = CartItem & { sku: SkuInfo }

const DELETED_SHOP_ID = "__deleted__"

/** 服务端失效原因的唯一取值（CartLine.REASON_UNAVAILABLE） */
const REASON_UNAVAILABLE = "SKU_UNAVAILABLE"

export type CartShopGroup = {
    shopId: string
    shopName: string
    shopNameKey?: "cart.group.deletedShop"
    items: CartItem[]
}

export type CartItemView = {
    image?: string
    title: string
    titleKey?: "cart.item.deletedTitle"
    skuName?: string
    price?: Money
    outOfStock: boolean
    disabled: boolean
}

function isSellable(item: CartItem): item is SellableCartItem {
    return item.available && item.selected
}

export function deriveSelectedItems(items: CartItem[]): SellableCartItem[] {
    return items.filter(isSellable)
}

export function deriveSelectedTotal(selectedItems: SellableCartItem[]): Money {
    return sumMoney(selectedItems.map((i) => timesMoney(i.sku.price, i.quantity)))
}

export function deriveAllSelected(items: CartItem[]): boolean {
    const available = items.filter((item) => item.available)
    return available.length > 0 && available.every((item) => item.selected)
}

export function groupByShop(items: CartItem[]): CartShopGroup[] {
    const groups: CartShopGroup[] = []
    for (const item of items) {
        // 失效条目（下架/停售/已删，服务端同一句 SKU_UNAVAILABLE；店铺解析不出时 shopName
        // 为空）不再有可信的店铺归属：全部聚进「已失效」一组，让买家一处看清、一处清理
        const deleted = item.unavailableReason === REASON_UNAVAILABLE || !item.sku?.shopName
        const shopId = deleted ? DELETED_SHOP_ID : (item.sku?.shopId ?? DELETED_SHOP_ID)
        const shopName = deleted ? "" : (item.sku?.shopName ?? "")
        const shopNameKey: CartShopGroup["shopNameKey"] = deleted
            ? "cart.group.deletedShop"
            : undefined
        const group = groups.find((g) => g.shopId === shopId)
        if (group) group.items.push(item)
        else groups.push({ shopId, shopName, shopNameKey, items: [item] })
    }
    return groups
}

export function selectableIdsOf(group: CartShopGroup): string[] {
    return group.items.filter((item) => item.available).map((item) => item.id)
}

export function deriveCartItemView(item: CartItem): CartItemView {
    // 失效判定按 unavailableReason（服务端唯一取值 SKU_UNAVAILABLE），不按 sku 在不在——
    // 契约把 sku 标成必有，服务端失效行才回 null；判 reason 对两种事实都成立
    if (item.unavailableReason === REASON_UNAVAILABLE) {
        return {
            title: "",
            titleKey: "cart.item.deletedTitle",
            outOfStock: false,
            disabled: true,
        }
    }
    return {
        image: item.sku?.imageUrl || undefined,
        title: item.sku?.title ?? "",
        skuName: item.sku?.specValuesJson || undefined,
        price: item.sku?.price,
        // 契约只给 available + unavailableReason，没有库存数
        outOfStock: !item.available,
        disabled: !item.available,
    }
}

const MAX_CART_QUANTITY = AddCartItemRequestSchema.properties.quantity.maximum

export type QuantityVerdict =
    | { ok: true }
    | { ok: false; reason: "outOfRange" }
    | { ok: false; reason: "overStock"; stock: number }

/** 数量上下界校验：新契约不给库存数，overStock 只在本地已知库存时才会返回 */
export function validateQuantity(item: CartItem, quantity: number): QuantityVerdict {
    if (quantity < 1 || quantity > MAX_CART_QUANTITY) return { ok: false, reason: "outOfRange" }
    void item
    return { ok: true }
}

export function patchItem(list: CartItem[], id: string, patch: Partial<CartItem>): CartItem[] {
    return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

export function setItemsSelected(
    list: CartItem[],
    itemIds: string[] | undefined,
    selected: boolean,
): CartItem[] {
    return itemIds === undefined
        ? list.map((item) => ({ ...item, selected }))
        : (() => {
              const idSet = new Set(itemIds)
              return list.map((item) => (idSet.has(item.id) ? { ...item, selected } : item))
          })()
}

export function removeItems(list: CartItem[], ids: string[]): CartItem[] {
    const idSet = new Set(ids)
    return list.filter((item) => !idSet.has(item.id))
}
