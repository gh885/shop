import { AddCartItemRequestSchema } from "@shop/api/schemas"
import type {
    CartItemView as ApiCartItemView,
    CartProductInfo as SdkCartProductInfo,
    SkuInfo,
} from "@shop/api/sdk"
import {
    type Money,
    strikethroughPrice,
    sumMoney,
    timesMoney,
} from "@shop/common/domain" /** 购物车嵌入的商品缩略信息 —— 契约同 SDK CartProductInfo，仅重命名投影（name→title、mainImage→image） */
type CartItemProduct = Omit<SdkCartProductInfo, "name" | "mainImage"> & {
    title: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
}

/**
 * 购物车条目投影 —— 对齐后端购物车列表接口（SDK CartItemView）嵌入的 slim 形状。
 * 注意：这里嵌的是 cart 接口自带的 product/sku 缩略（CartProductInfo / SkuInfo），
 * 不是完整商品/SKU 领域对象 —— 购物车只消费店名/图/价/库存，拿全量实属浪费。
 *
 * <p>product/sku 可空 = 商品或 SKU <b>已被删除</b>（不是下架：下架时快照仍在，只是 available=false），
 * 后端此时连快照都不返回，前端按「失效条目」置灰保留，让买家还能把它删掉。
 * 两者同生共死——后端 `product = sku == null ? null : …`，SKU 没了商品必然也没了。
 */
export type CartItem = {
    id: string
    skuId: string
    quantity: number
    selected: boolean
    available: boolean
    /** 商品缩略快照；null = 商品已被删除（此时 sku 也必为 null） */
    product: CartItemProduct | null
    /** SKU 快照（价格/库存/规格图）；null = SKU 已被删除 */
    sku: SkuInfo | null
}

/** 快照齐全那条线收窄成的类型：组件拿到它就不用再判 product/sku 是否为 null */
export type SellableCartItem = CartItem & { product: CartItemProduct; sku: SkuInfo }

/** 「商品已被删除」那一组的店铺 key：后端不再给 shopId，用哨兵把它们聚成一组 */
const DELETED_SHOP_ID = "__deleted__"

/**
 * cart 模块 —— 纯逻辑（投影映射 + 派生 + 缓存变换语义）。不碰 React / 网络。
 *
 * 这些不是「购物车的业务规则」（那是后端 server 模块裁决的，前端不复制），只做形状归一与视图读模型；
 * 数量越界/库存这个 UX 预判在 use-cart 的 useCartItemActions 里（仍以后端裁决为准）。
 */

// 投影映射（wire → 领域）
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
        product:
            dto.product === null
                ? // oxlint-disable-next-line no-null -- 领域契约：product 可空（CartItemProduct | null，已删商品）
                  null
                : {
                      id: dto.product.id,
                      title: dto.product.name,
                      image: dto.product.mainImage ?? undefined,
                      shopId: dto.product.shopId,
                      shopName: dto.product.shopName,
                  },
        sku: dto.sku,
    }
}

// 派生（缓存 → 视图读模型）
/** 按店铺分组的展示单元：店铺信息取自组内首条（同一车同店字段一致） */
export type CartShopGroup = {
    shopId: string
    /** 真实店名；失效组为空串，展示走 shopNameKey */
    shopName: string
    /** 失效组的展示 key（真实店为 undefined）；渲染时 t(shopNameKey) */
    shopNameKey?: "web.cart.group.deletedShop"
    items: CartItem[]
}

/** 购物车条目行的视图读模型：组件不再在内部算这些，也不再自己判 product/sku 是否还在 */
export type CartItemView = {
    /** 主图（可空，UI 用占位图） */
    image?: string
    /** 商品标题（真实标题）；已删条目为空串，展示走 titleKey */
    title: string
    /** 已删条目的占位标题 key（正常条目为 undefined）；渲染时 t(titleKey) */
    titleKey?: "web.cart.item.deletedTitle"
    /** SKU 规格名（无 SKU 快照时为空） */
    skuName?: string
    /** 现价：SKU 已删则无价可展示 */
    price?: Money
    /** 划线价：无划线价时为空 */
    original?: Money
    stock: number
    outOfStock: boolean
    disabled: boolean
}

/** 结算口径的「已勾选且可售」：available、快照齐全、且已被勾选 —— 三项缺一不进合计 */
function isSellable(item: CartItem): item is SellableCartItem {
    return item.available && item.selected && item.product !== null && item.sku !== null
}

/** 已勾选且可售的条目：结算与批量删除选中都基于它 */
export function deriveSelectedItems(items: CartItem[]): SellableCartItem[] {
    return items.filter(isSellable)
}

/** 选中条目合计：单价 × 件数逐条累加，全程不离开 Money */
export function deriveSelectedTotal(selectedItems: SellableCartItem[]): Money {
    return sumMoney(selectedItems.map((i) => timesMoney(i.sku.price, i.quantity)))
}

/**
 * 全选态：只看可售条目（失效条目不参与全选语义）；无可售条目时为 false。
 * 只有「未选 / 全选」两态，不做半选 —— 部分勾选时全选框显示为未选。
 */
export function deriveAllSelected(items: CartItem[]): boolean {
    const available = items.filter((item) => item.available)
    return available.length > 0 && available.every((item) => item.selected)
}

/** 整车 → 按店铺分组，保持服务端返回顺序（组内/组间均不重排）；商品已删除的条目归入末尾「失效商品」组 */
export function groupByShop(items: CartItem[]): CartShopGroup[] {
    const groups: CartShopGroup[] = []
    for (const item of items) {
        const shopId = item.product?.shopId ?? DELETED_SHOP_ID
        const shopName = item.product?.shopName ?? ""
        const shopNameKey: CartShopGroup["shopNameKey"] = shopName
            ? undefined
            : "web.cart.group.deletedShop"
        const group = groups.find((g) => g.shopId === shopId)
        if (group) group.items.push(item)
        else groups.push({ shopId, shopName, shopNameKey, items: [item] })
    }
    return groups
}

/** 组内可售条目的 ID 列表（店铺全选/取消的入参；失效条目不可勾选，排除） */
export function selectableIdsOf(group: CartShopGroup): string[] {
    return group.items.filter((item) => item.available).map((item) => item.id)
}

/** 购物车条目行的视图读模型：商品/SKU 已删时给失效占位（无价、无 SKU 名、置灰） */
export function deriveCartItemView(item: CartItem): CartItemView {
    if (item.sku === null || item.product === null) {
        return {
            title: "",
            titleKey: "web.cart.item.deletedTitle",
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

// 缓存变换语义（乐观 patch 的唯一来源）
/**
 * 单条数量上限（后端裁决，这里仅用于前端预判，避免多打一个往返）。
 * 直接引用生成的 AddCartItemRequest.quantity.maximum，后端改规则并重生成后这里跟着更新。
 */
export const MAX_CART_QUANTITY = AddCartItemRequestSchema.properties.quantity.maximum

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
        : (() => {
              // 勾选集转 Set：行级 includes 是 O(n×m)
              const idSet = new Set(itemIds)
              return list.map((item) => (idSet.has(item.id) ? { ...item, selected } : item))
          })()
}

/** 删除（单条/批量共用） */
export function removeItems(list: CartItem[], ids: string[]): CartItem[] {
    const idSet = new Set(ids)
    return list.filter((item) => !idSet.has(item.id))
}
