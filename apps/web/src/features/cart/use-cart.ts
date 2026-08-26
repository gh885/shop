import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
    addCartItem,
    batchRemoveCartItems,
    fetchCartCount,
    fetchCartItems,
    removeCartItem,
    updateCartItem,
    updateCartSelected,
    type CartItem,
} from "#/entities/cart"
import { useIsLoggedIn } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"
import { useOptimisticListMutation } from "#/shared/lib/use-optimistic-list"
/**
 * 购物车数据 hooks：列表查询 + 乐观更新 mutations（勾选/数量/删除先改缓存、失败回滚）。
 * 整车都要求登录，路由层用 requireAuth 守卫，这里不做未登录降级。
 */

const KEY = ["cart-items"] as const

/** 购物车列表：仅在路由 /cart（_protected 内）使用。
 * 登录态由 _protected 布局 gate 保证（authed 后才渲染子路由），挂载时必已登录，
 * 数据层无需再写 enabled gating。 */
export const cartItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: fetchCartItems,
})

export function useCartItems() {
    return useQuery(cartItemsOptions)
}

/** 角标计数：免拉整车，头部角标用；可在公开页（SiteHeader/首页）使用，故必须保留 enabled gating ——
 * 不在 _protected 内，未登录时不发请求，避免公开页访问时打 401 */
export const cartCountOptions = queryOptions({
    queryKey: ["cart-count"],
    queryFn: fetchCartCount,
    staleTime: 30_000,
})

export function useCartCount() {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...cartCountOptions, enabled: isLoggedIn })
}

/** 加购 mutation：成功 toast + 失效角标计数；导航到购物车由调用方决定 */
export function useAddToCart() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
            addCartItem(skuId, quantity),
        onSuccess: () => {
            notify.success("已加入购物车")
            void qc.invalidateQueries({ queryKey: ["cart-count"] })
        },
    })
}

/** 改数量（步进器 ±1） */
export function useUpdateCartQuantity() {
    return useOptimisticListMutation<CartItem, { id: string; quantity: number }>({
        queryKey: KEY,
        mutationFn: ({ id, quantity }) => updateCartItem(id, { quantity }),
        patch: (list, { id, quantity }) =>
            list.map((item) => (item.id === id ? { ...item, quantity } : item)),
        messages: { error: "修改数量失败" },
    })
}

/** 单条勾选/取消 */
export function useToggleCartItem() {
    return useOptimisticListMutation<CartItem, { id: string; selected: boolean }>({
        queryKey: KEY,
        mutationFn: ({ id, selected }) => updateCartItem(id, { selected }),
        patch: (list, { id, selected }) =>
            list.map((item) => (item.id === id ? { ...item, selected } : item)),
        messages: { error: "勾选失败" },
    })
}

/** 批量勾选：itemIds 省略 = 整车（全选/取消全选），传列表 = 按店铺勾选 */
export function useSelectCartItems() {
    return useOptimisticListMutation<CartItem, { itemIds?: string[]; selected: boolean }>({
        queryKey: KEY,
        mutationFn: ({ itemIds, selected }) => updateCartSelected(itemIds, selected),
        patch: (list, { itemIds, selected }) =>
            itemIds === undefined
                ? list.map((item) => ({ ...item, selected }))
                : list.map((item) => (itemIds.includes(item.id) ? { ...item, selected } : item)),
        messages: { error: "勾选失败" },
    })
}

/** 删一条 */
export function useRemoveCartItem() {
    return useOptimisticListMutation<CartItem, string>({
        queryKey: KEY,
        mutationFn: (id) => removeCartItem(id),
        patch: (list, id) => list.filter((item) => item.id !== id),
        messages: { error: "删除失败" },
    })
}

/** 批量删（删除选中 / 清除失效共用） */
export function useBatchRemoveCartItems() {
    return useOptimisticListMutation<CartItem, string[]>({
        queryKey: KEY,
        mutationFn: (itemIds) => batchRemoveCartItems(itemIds),
        patch: (list, itemIds) => list.filter((item) => !itemIds.includes(item.id)),
        messages: { error: "删除失败" },
    })
}
