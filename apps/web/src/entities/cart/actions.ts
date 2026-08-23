import { z } from "zod"

import { api } from "#/shared/api/client"

import { CartItemsSchema, type CartItem } from "./model"

/**
 * Cart 数据层读写命令（纯逻辑，不含 React Query / React）。
 * 全部接口要求登录（后端 JwtAuthFilter 未放行 /cart，401 由路由守卫兜住），仅浏览器端调用。
 * features/cart/use-cart 在此之上包 hooks。
 */

/** 整车列表：现价/库存/店铺由后端读取时拼装，失效条目置灰保留 */
export async function fetchCartItems(): Promise<CartItem[]> {
    return CartItemsSchema.parse(await api.raw.get("cart/items").json())
}

/** 角标计数 wire：镜像后端 CartService.CartCount（total 全部 / selected 已勾选） */
const CartCountSchema = z.object({
    total: z.number().int(),
    selected: z.number().int(),
})

/** 购物车角标计数：免拉整车，头部角标用 */
export async function fetchCartCount(): Promise<number> {
    return CartCountSchema.parse(await api.raw.get("cart/count").json()).total
}

/** 加购：同 SKU 幂等合并为数量累加（后端处理），成功仅需 201，无需解析返回体 */
export async function addCartItem(skuId: string, quantity: number): Promise<void> {
    await api.raw.post("cart/items", { json: { skuId, quantity } })
}

/** 改数量或勾选（部分更新，null 字段后端保持原值） */
export async function updateCartItem(
    id: string,
    patch: { quantity?: number; selected?: boolean },
): Promise<void> {
    await api.raw.put(`cart/items/${id}`, { json: patch })
}

/** 批量勾选：itemIds 省略 = 整车；按店铺勾选传该店条目 ID 列表 */
export async function updateCartSelected(itemIds: string[] | undefined, selected: boolean) {
    await api.raw.put("cart/items/selected", { json: { itemIds, selected } })
}

/** 删一条 */
export async function removeCartItem(id: string): Promise<void> {
    await api.raw.delete(`cart/items/${id}`)
}

/** 批量删：「删除选中」「清除失效商品」共用 */
export async function batchRemoveCartItems(itemIds: string[]): Promise<void> {
    await api.raw.post("cart/items/batch-delete", { json: { itemIds } })
}
