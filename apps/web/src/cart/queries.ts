import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { CartApi } from "@shop/api/sdk"
import type { AddCartItemRequest, UpdateCartSelectedRequest } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { patchItem, removeItems, setItemsSelected, type CartItem } from "./rules"
import { toCartItem } from "./mapper"

/** 购物车缓存 key（items 是并发 query 与所有 mutation 共享的唯一失效入口；checkout 下单后失效走 all，覆盖 items+count） */
const cartAll = ["cart"] as const

export const cartKeys = {
    all: cartAll,
    items: [...cartAll, "items"] as const,
    count: [...cartAll, "count"] as const,
} as const

export const cartItemsOptions = queryOptions({
    queryKey: cartKeys.items,
    queryFn: async ({ signal }): Promise<CartItem[]> => {
        const res = await CartApi.listCartItems({ signal })
        return res.map(toCartItem)
    },
})

const cartCountOptions = queryOptions({
    queryKey: cartKeys.count,
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
            invalidates: [cartKeys.count],
        },
    })
}

export function useUpdateCartQuantity() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; quantity: number }>({
            queryKey: cartKeys.items,
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
            queryKey: cartKeys.items,
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
            queryKey: cartKeys.items,
            mutationFn: ({ itemIds, selected }) =>
                CartApi.updateCartSelected({ body: { itemIds, selected } }),
            patch: (list, { itemIds, selected }) => setItemsSelected(list, itemIds, selected),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

export function useRemoveCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string>({
            queryKey: cartKeys.items,
            mutationFn: (id) => CartApi.removeCartItem({ path: { id } }),
            patch: (list, id) => removeItems(list, [id]),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [cartKeys.count] },
        }),
    )
}

export function useBatchRemoveCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string[]>({
            queryKey: cartKeys.items,
            mutationFn: (itemIds) => CartApi.batchRemoveCartItems({ body: { itemIds } }),
            patch: (list, itemIds) => removeItems(list, itemIds),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [cartKeys.count] },
        }),
    )
}
