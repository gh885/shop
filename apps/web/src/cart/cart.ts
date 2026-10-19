import { AddCartItemRequestSchema } from "@shop/api/schemas"
import type { CartProductInfo as SdkCartProductInfo, SkuInfo } from "@shop/api/sdk"
import { type Money, strikethroughPrice, sumMoney, timesMoney } from "@shop/common/domain"
type CartItemProduct = Omit<SdkCartProductInfo, "name" | "mainImage"> & {
    title: string
    image?: string
}

export type CartItem = {
    id: string
    skuId: string
    quantity: number
    selected: boolean
    available: boolean
    product: CartItemProduct | null
    sku: SkuInfo | null
}

export type SellableCartItem = CartItem & { product: CartItemProduct; sku: SkuInfo }

const DELETED_SHOP_ID = "__deleted__"

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
    original?: Money
    stock: number
    outOfStock: boolean
    disabled: boolean
}

function isSellable(item: CartItem): item is SellableCartItem {
    return item.available && item.selected && item.product !== null && item.sku !== null
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
        const shopId = item.product?.shopId ?? DELETED_SHOP_ID
        const shopName = item.product?.shopName ?? ""
        const shopNameKey: CartShopGroup["shopNameKey"] = shopName
            ? undefined
            : "cart.group.deletedShop"
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
    if (item.sku === null || item.product === null) {
        return {
            title: "",
            titleKey: "cart.item.deletedTitle",
            stock: 0,
            outOfStock: false,
            disabled: true,
        }
    }
    const stock = item.sku.stock
    return {
        image: item.sku.image ?? item.product.image,
        title: item.product.title,
        skuName: item.sku.name || undefined,
        price: item.sku.price,
        original: strikethroughPrice(item.sku.originalPrice, item.sku.price),
        stock,
        outOfStock: item.available && stock === 0,
        disabled: !item.available,
    }
}

const MAX_CART_QUANTITY = AddCartItemRequestSchema.properties.quantity.maximum

export type QuantityVerdict =
    | { ok: true }
    | { ok: false; reason: "outOfRange" }
    | { ok: false; reason: "overStock"; stock: number }

/** 数量上下界与库存校验的纯判定：调用点据此决定静默还是提示 */
export function validateQuantity(item: CartItem, quantity: number): QuantityVerdict {
    if (quantity < 1 || quantity > MAX_CART_QUANTITY) return { ok: false, reason: "outOfRange" }
    const stock = item.sku?.stock ?? 0
    if (stock > 0 && quantity > stock) return { ok: false, reason: "overStock", stock }
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
