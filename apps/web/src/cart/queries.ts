import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { CartApi } from "@shop/api/sdk"
import type { AddCartItemRequest, UpdateCartSelectedRequest } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { notify, optimisticListMutationOptions } from "@shop/app-kit/data"
import { MAX_CART_QUANTITY, patchItem, removeItems, setItemsSelected, type CartItem } from "./cart"
import { toCartItem } from "./mapper"

/** 购物车列表缓存 key（并发 query 与所有 mutation 共享，是唯一失效入口；checkout 下单后也引用它失效） */
export const CART_ITEMS_KEY = ["cart-items"] as const

export const CART_COUNT_KEY = ["cart-count"] as const

export const cartItemsOptions = queryOptions({
    queryKey: CART_ITEMS_KEY,
    queryFn: async ({ signal }): Promise<CartItem[]> => {
        const res = await CartApi.listCartItems({ signal })
        return res.map(toCartItem)
    },
})

const cartCountOptions = queryOptions({
    queryKey: CART_COUNT_KEY,
    queryFn: async ({ signal }): Promise<number> => {
        const res = await CartApi.getCartCount({ signal })
        return res.total
    },
    staleTime: 30_000,
    throwOnError: false,
})

export function useCartCount() {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...cartCountOptions, enabled: isLoggedIn })
}

export function useAddToCart() {
    return useMutation({
        mutationFn: ({ skuId, quantity }: AddCartItemRequest) =>
            CartApi.addCartItem({ body: { skuId, quantity } }),
        meta: {
            success: message("cart.toast.added"),
            error: message("cart.toast.addFailed"),
            invalidates: [CART_COUNT_KEY],
        },
    })
}

function useUpdateCartQuantity() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; quantity: number }>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ id, quantity }) =>
                CartApi.updateCartItem({ path: { id }, body: { quantity } }),
            patch: (list, { id, quantity }) => patchItem(list, id, { quantity }),
            meta: { error: message("cart.toast.updateQtyFailed") },
        }),
    )
}

export function useToggleCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; selected: boolean }>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ id, selected }) =>
                CartApi.updateCartItem({ path: { id }, body: { selected } }),
            patch: (list, { id, selected }) => patchItem(list, id, { selected }),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

export function useSelectCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, UpdateCartSelectedRequest>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: ({ itemIds, selected }) =>
                CartApi.updateCartSelected({ body: { itemIds, selected } }),
            patch: (list, { itemIds, selected }) => setItemsSelected(list, itemIds, selected),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

function useRemoveCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: (id) => CartApi.removeCartItem({ path: { id } }),
            patch: (list, id) => removeItems(list, [id]),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [CART_COUNT_KEY] },
        }),
    )
}

export function useBatchRemoveCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string[]>({
            queryKey: CART_ITEMS_KEY,
            mutationFn: (itemIds) => CartApi.batchRemoveCartItems({ body: { itemIds } }),
            patch: (list, itemIds) => removeItems(list, itemIds),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [CART_COUNT_KEY] },
        }),
    )
}

export type CartItemActions = ReturnType<typeof useCartItemActions>

export function useCartItemActions() {
    const toggle = useToggleCartItem()
    const updateQty = useUpdateCartQuantity()
    const remove = useRemoveCartItem()

    return {
        toggleItem: (id: string, selected: boolean) => toggle.mutate({ id, selected }),
        updateQuantity: (item: CartItem, quantity: number) => {
            if (quantity < 1 || quantity > MAX_CART_QUANTITY) return
            const stock = item.sku?.stock ?? 0
            if (stock > 0 && quantity > stock) {
                notify.info(message("cart.toast.maxStock", { stock }))
                return
            }
            updateQty.mutate({ id: item.id, quantity })
        },
        removeItem: (id: string) => remove.mutate(id),
    }
}
