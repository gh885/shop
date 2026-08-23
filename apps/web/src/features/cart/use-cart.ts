import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query"

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

/**
 * 购物车数据 hooks：列表查询 + 乐观更新 mutations（勾选/数量/删除先改缓存、失败回滚）。
 * 整车都要求登录，路由层用 requireAuth 守卫，这里不做未登录降级。
 */

const KEY = ["cart-items"] as const

export const cartItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: fetchCartItems,
})

export function useCartItems() {
    // 整车要求登录：登录态裁决前不发请求，避免未登录直访 /cart 时先打出一串 401。
    // 未登录由路由守卫（requireAuth / useAuthGuard）拉起登录 Dialog，不在这里降级。
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...cartItemsOptions, enabled: isLoggedIn })
}

/** 角标计数：免拉整车，头部角标用；同样要求登录，未登录不发请求 */
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

/** 乐观更新脚手架（与 features/address/use-address 同款）：先本地 patch，失败回滚，settled 重取 */
function useOptimisticCartMutation<TVars>(
    mutationFn: (vars: TVars) => Promise<unknown>,
    patch: (list: CartItem[], vars: TVars) => CartItem[],
    messages: { error: string },
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn,
        onMutate: async (vars) => {
            await qc.cancelQueries({ queryKey: KEY })
            const prev = qc.getQueryData<CartItem[]>(KEY)
            qc.setQueryData<CartItem[]>(KEY, (old) => patch(old ?? [], vars))
            return { prev }
        },
        onError: (err, _vars, ctx) => {
            qc.setQueryData(KEY, ctx?.prev)
            notify.fromError(err, messages.error)
        },
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    })
}

/** 改数量（步进器 ±1） */
export function useUpdateCartQuantity() {
    return useOptimisticCartMutation(
        ({ id, quantity }: { id: string; quantity: number }) => updateCartItem(id, { quantity }),
        (list, { id, quantity }) =>
            list.map((item) => (item.id === id ? { ...item, quantity } : item)),
        { error: "修改数量失败" },
    )
}

/** 单条勾选/取消 */
export function useToggleCartItem() {
    return useOptimisticCartMutation(
        ({ id, selected }: { id: string; selected: boolean }) => updateCartItem(id, { selected }),
        (list, { id, selected }) =>
            list.map((item) => (item.id === id ? { ...item, selected } : item)),
        { error: "勾选失败" },
    )
}

/** 批量勾选：itemIds 省略 = 整车（全选/取消全选），传列表 = 按店铺勾选 */
export function useSelectCartItems() {
    return useOptimisticCartMutation(
        ({ itemIds, selected }: { itemIds?: string[]; selected: boolean }) =>
            updateCartSelected(itemIds, selected),
        (list, { itemIds, selected }) =>
            itemIds === undefined
                ? list.map((item) => ({ ...item, selected }))
                : list.map((item) => (itemIds.includes(item.id) ? { ...item, selected } : item)),
        { error: "勾选失败" },
    )
}

/** 删一条 */
export function useRemoveCartItem() {
    return useOptimisticCartMutation(
        (id: string) => removeCartItem(id),
        (list, id) => list.filter((item) => item.id !== id),
        { error: "删除失败" },
    )
}

/** 批量删（删除选中 / 清除失效共用） */
export function useBatchRemoveCartItems() {
    return useOptimisticCartMutation(
        (itemIds: string[]) => batchRemoveCartItems(itemIds),
        (list, itemIds) => list.filter((item) => !itemIds.includes(item.id)),
        { error: "删除失败" },
    )
}
