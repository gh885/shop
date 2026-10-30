import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"
import { CartControllerApi } from "@shop/api/sdk"
import type { AddCartItemRequest } from "@shop/api/sdk"

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
        const view = await CartControllerApi.listCart({ signal })
        return view.lines.map(toCartItem)
    },
})

const cartCountOptions = queryOptions({
    queryKey: cartKeys.count,
    queryFn: async ({ signal }): Promise<number> => {
        const res = await CartControllerApi.count({ signal })
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
            CartControllerApi.addCartItem({ body: { skuId, quantity } }),
        meta: {
            success: message("cart.toast.added"),
            error: message("cart.toast.addFailed"),
            invalidates: [cartKeys.count, cartKeys.items],
        },
    })
}

export function useUpdateCartQuantity() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; quantity: number }>({
            queryKey: cartKeys.items,
            mutationFn: ({ id, quantity }) =>
                CartControllerApi.updateQuantity({ path: { skuId: id }, body: { quantity } }),
            patch: (list, { id, quantity }) => patchItem(list, id, { quantity }),
            meta: { error: message("cart.toast.updateQtyFailed") },
        }),
    )
}

export function useToggleCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { id: string; selected: boolean }>({
            queryKey: cartKeys.items,
            // 契约里勾选是「整体替换选中集合」，所以先把当前勾选的 skuIds 拿来增删
            mutationFn: async ({ id, selected }) => {
                const current = await CartControllerApi.listCart()
                const skuIds = new Set(current.lines.filter((l) => l.selected).map((l) => l.skuId))
                if (selected) skuIds.add(id)
                else skuIds.delete(id)
                return CartControllerApi.replaceSelection({
                    body: { skuIds: [...skuIds].filter(Boolean) },
                })
            },
            patch: (list, { id, selected }) => patchItem(list, id, { selected }),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

export function useSelectCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, { itemIds?: string[]; selected: boolean }>({
            queryKey: cartKeys.items,
            mutationFn: async ({ itemIds, selected }) => {
                if (!selected) {
                    return CartControllerApi.replaceSelection({ body: { skuIds: [] } })
                }
                if (itemIds === undefined) {
                    const current = await CartControllerApi.listCart()
                    const all = current.lines.map((l) => l.skuId).filter(Boolean)
                    return CartControllerApi.replaceSelection({ body: { skuIds: all } })
                }
                return CartControllerApi.replaceSelection({ body: { skuIds: itemIds } })
            },
            patch: (list, { itemIds, selected }) => setItemsSelected(list, itemIds, selected),
            meta: { error: message("cart.toast.toggleFailed") },
        }),
    )
}

export function useRemoveCartItem() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string>({
            queryKey: cartKeys.items,
            mutationFn: (id) => CartControllerApi.removeCartItem({ path: { skuId: id } }),
            patch: (list, id) => removeItems(list, [id]),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [cartKeys.count] },
        }),
    )
}

export function useBatchRemoveCartItems() {
    return useMutation(
        optimisticListMutationOptions<CartItem, string[]>({
            queryKey: cartKeys.items,
            mutationFn: (itemIds) => CartControllerApi.removeAll({ body: { skuIds: itemIds } }),
            patch: (list, itemIds) => removeItems(list, itemIds),
            meta: { error: message("cart.toast.removeFailed"), invalidates: [cartKeys.count] },
        }),
    )
}
