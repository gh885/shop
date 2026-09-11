import type {
    CartItemView as ApiCartItemView,
    CartProductInfo as SdkCartProductInfo,
    SkuInfo,
} from "@shop/api/sdk"

/** 购物车嵌入的商品缩略信息 —— 契约同 SDK CartProductInfo，仅重命名投影（name→title、mainImage→image） */
type CartItemProduct = Omit<SdkCartProductInfo, "name" | "mainImage"> & {
    title: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
}

/**
 * 购物车条目投影 —— 对齐后端购物车列表接口（SDK CartItemView）嵌入的 slim 形状。
 * 注意：这里嵌的是 cart 接口自带的 product/sku 缩略（CartProductInfo / SkuInfo），
 * 不是完整商品/SKU 领域对象 —— 购物车只消费店名/图/价/库存，拿全量实属浪费。
 */
export type CartItem = {
    id: string
    skuId: string
    quantity: number
    selected: boolean
    available: boolean
    /** available=false 时商品已下架，product 仍有值（展示快照用） */
    product: CartItemProduct
    /** SKU 快照（价格/库存/规格图） */
    sku: SkuInfo
}

/**
 * cart 模块 —— 纯逻辑（投影映射 + 派生 + 缓存变换语义 + UX 守卫）。不碰 React / 网络。
 *
 * 这些不是「购物车的业务规则」（那是后端 server 模块裁决的，前端不复制），而是：
 * - toCartItem    ：wire → 投影（形状归一）
 * - derive*       ：缓存 → 视图读模型（groupByShop / 合计 / 全选态 / 条目视图）
 * - patchItem     ：单条乐观 patch（勾选/改量共用，一次写入如何作用于 cache）
 * - setItemsSelected / removeItems：批量/删除的缓存变换语义
 * 数量越界/库存这个 UX 预判在 use-cart 的 useCartItemActions 里（仍以后端裁决为准）。
 */

// ---------- 投影映射（wire → 领域） ----------

/**
 * 轻量映射：只做组件真正需要的两个重命名（wire name/mainImage → 域 title/image）
 * 与 available 默认 true，其余字段原样透传。不做逐字段造假兜底（`?? ""` 一律避免）。
 */
export function toCartItem(dto: ApiCartItemView): CartItem {
    return {
        id: dto.id,
        skuId: dto.skuId,
        quantity: dto.quantity,
        selected: dto.selected,
        available: dto.available,
        product: {
            id: dto.product.id,
            title: dto.product.name,
            image: dto.product.mainImage ?? undefined,
            shopId: dto.product.shopId,
            shopName: dto.product.shopName,
        },
        sku: dto.sku,
    }
}

// ---------- 派生（缓存 → 视图读模型） ----------

/** 按店铺分组的展示单元：店铺信息取自组内首条（同一车同店字段一致） */
export type CartShopGroup = {
    shopId: string
    shopName: string
    items: CartItem[]
}

/** 购物车条目行的视图读模型：组件不再在内部算这些 */
export type CartItemView = {
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    title: string
    stock: number
    outOfStock: boolean
    disabled: boolean
}

/** 已勾选且可售的条目：结算与批量删除选中都基于它 */
export function deriveSelectedItems(items: CartItem[]): CartItem[] {
    return items.filter((item) => item.available && item.selected)
}

/** 选中条目合计金额（分） */
export function deriveSelectedTotal(selectedItems: CartItem[]): number {
    return selectedItems.reduce((sum, i) => sum + i.sku.price.amount * i.quantity, 0)
}

/**
 * 全选态：只看可售条目（失效条目不参与全选语义）；无可售条目时为 false。
 * 只有「未选 / 全选」两态，不做半选 —— 部分勾选时全选框显示为未选。
 */
export function deriveAllSelected(items: CartItem[]): boolean {
    const available = items.filter((item) => item.available)
    return available.length > 0 && available.every((item) => item.selected)
}

/** 整车 → 按店铺分组，保持服务端返回顺序（组内/组间均不重排）；失效条目归入末尾「失效商品」组 */
export function groupByShop(items: CartItem[]): CartShopGroup[] {
    const groups: CartShopGroup[] = []
    for (const item of items) {
        const shopId = item.product.shopId
        const shopName = item.product.shopName || "失效商品"
        const group = groups.find((g) => g.shopId === shopId)
        if (group) group.items.push(item)
        else groups.push({ shopId, shopName, items: [item] })
    }
    return groups
}

/** 组内可售条目的 ID 列表（店铺全选/取消的入参；失效条目不可勾选，排除） */
export function selectableIdsOf(group: CartShopGroup): string[] {
    return group.items.filter((item) => item.available).map((item) => item.id)
}

/** 购物车条目行的视图读模型 */
export function deriveCartItemView(item: CartItem): CartItemView {
    const stock = item.sku.stock
    return {
        image: item.sku.image ?? item.product.image,
        title: item.product.title,
        stock,
        outOfStock: item.available && stock === 0,
        disabled: !item.available,
    }
}

// ---------- 缓存变换语义（乐观 patch 的唯一来源） ----------

/** 单条数量上限（后端裁决，这里仅用于前端预判，避免多打一个往返） */
export const MAX_CART_QUANTITY = 999

/** 单条 patch：勾选与改数量共用（改数量前由调用方做越界/库存预判） */
export function patchItem(list: CartItem[], id: string, patch: Partial<CartItem>): CartItem[] {
    return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

/** 批量勾选：itemIds 省略 = 整车（全选/取消全选），传列表 = 按店铺勾选 */
export function setItemsSelected(
    list: CartItem[],
    itemIds: string[] | undefined,
    selected: boolean,
): CartItem[] {
    return itemIds === undefined
        ? list.map((item) => ({ ...item, selected }))
        : list.map((item) => (itemIds.includes(item.id) ? { ...item, selected } : item))
}

/** 删除（单条/批量共用） */
export function removeItems(list: CartItem[], ids: string[]): CartItem[] {
    return list.filter((item) => !ids.includes(item.id))
}
