import { z } from "zod"

import { MoneySchema, type Money } from "@shop/api"

/**
 * entities/cart 凝聚模块 —— 买家购物车领域对象 + 数据层。
 *
 * - 本文件（model.ts）：DTO（私有，镜像后端 cart CartItemView wire）+ 业务形状 + 店铺分组纯逻辑
 * - actions.ts：读写命令（全部要求登录，走 shared/api/client 的 authed api，仅浏览器端调用）
 * 对外（index.ts）只暴露业务形状，传输 DTO 不出门。金额一律 Money（分 + 币种）。
 */

// ---------- 传输层（私有，镜像 CartController / CartItemView） ----------

const CartItemDtoSchema = z.object({
    id: z.uuid(),
    skuId: z.uuid(),
    quantity: z.number().int().min(1),
    selected: z.boolean(),
    addedAt: z.string(),
    product: z
        .object({
            id: z.uuid(),
            name: z.string(),
            mainImage: z.string().nullable(),
            shopId: z.uuid(),
            shopName: z.string().nullable(),
        })
        .nullable(),
    sku: z
        .object({
            id: z.uuid(),
            name: z.string(),
            image: z.string().nullable(),
            price: MoneySchema.nullable(),
            originalPrice: MoneySchema.nullable(),
            stock: z.number().int().nullable(),
            status: z.number().int().nullable(),
        })
        .nullable(),
    available: z.boolean(),
})

// ---------- 业务层 ----------

/**
 * 购物车条目业务形状：图片 null 归一成空串，stock 缺失按 0 处理。
 * product/sku 可为 null（SPU/SKU 被删的失效条目），渲染层给兜底文案；
 * available=false（下架/停售/被删）保留展示由渲染层置灰；stock=0 标缺货。
 */
export const CartItemSchema = CartItemDtoSchema.transform((dto) => ({
    id: dto.id,
    skuId: dto.skuId,
    quantity: dto.quantity,
    selected: dto.selected,
    addedAt: dto.addedAt,
    available: dto.available,
    product: dto.product
        ? {
              id: dto.product.id,
              title: dto.product.name,
              image: dto.product.mainImage ?? "",
              shopId: dto.product.shopId,
              shopName: dto.product.shopName ?? "",
          }
        : null,
    sku: dto.sku
        ? {
              id: dto.sku.id,
              name: dto.sku.name,
              /** undefined 表示无专属图（回退商品主图） */
              image: dto.sku.image ?? undefined,
              price: dto.sku.price,
              originalPrice: dto.sku.originalPrice,
              stock: dto.sku.stock ?? 0,
          }
        : null,
}))
export type CartItem = z.infer<typeof CartItemSchema>

export const CartItemsSchema = z.array(CartItemSchema)

// ---------- 店铺分组 ----------

/** 按店铺分组的展示单元：店铺信息取自组内首条（同一车同店字段一致） */
export interface CartShopGroup {
    shopId: string
    shopName: string
    items: CartItem[]
}

/** 整车 → 按店铺分组，保持服务端返回顺序（组内/组间均不重排）；失效条目（无 SPU）归入末尾「失效商品」组 */
export function groupByShop(items: CartItem[]): CartShopGroup[] {
    const groups: CartShopGroup[] = []
    for (const item of items) {
        const shopId = item.product?.shopId ?? "__invalid__"
        const shopName = item.product?.shopName || "失效商品"
        const group = groups.find((g) => g.shopId === shopId)
        if (group) group.items.push(item)
        else groups.push({ shopId, shopName, items: [item] })
    }
    return groups
}

// ---------- 展示辅助 ----------

// 金额格式化（fenToYuan 等）在 @shop/api，与 Money 契约同源，不在本模块重复定义

export type { Money }
