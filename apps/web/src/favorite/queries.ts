import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FavoritesApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { toFavoriteItem } from "./mapper"
import { type FavoriteItem } from "./favorite"

const KEY = ["favorite-items"] as const
const FAVORITES_QUERY = { query: { pageParams: { page: 1, size: 100 } } } as const

export const favoriteItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<FavoriteItem[]> => {
        const res = await FavoritesApi.listFavorites({ ...FAVORITES_QUERY, signal })
        return res.records.map(toFavoriteItem)
    },
})

export function useRemoveFavorites() {
    return useMutation(
        optimisticListMutationOptions<FavoriteItem, string[]>({
            queryKey: KEY,
            mutationFn: (productIds) =>
                Promise.all(
                    productIds.map((id) =>
                        FavoritesApi.removeFavorite({ path: { productId: id } }),
                    ),
                ),
            patch: (list, productIds) => {
                const removed = new Set(productIds)
                return list.filter((item) => !removed.has(item.productId))
            },
            meta: { error: message("favorite.toast.removeFailed") },
        }),
    )
}

const favoritedOptions = (productId: string) =>
    queryOptions({
        queryKey: ["favorite-status", productId] as const,
        queryFn: async ({ signal }) => {
            const res = await FavoritesApi.checkFavoriteExists({
                body: { productIds: [productId] },
                signal,
            })
            return res.productIds.includes(productId)
        },
        staleTime: 30_000,
        throwOnError: false,
    })

export function useFavoriteStatus(productId: string) {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...favoritedOptions(productId), enabled: isLoggedIn })
}

export function useToggleFavorite(productId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (favorited: boolean) => {
            if (favorited) await FavoritesApi.removeFavorite({ path: { productId } })
            else await FavoritesApi.addFavorite({ body: { productId } })
            return !favorited
        },
        meta: { error: message("favorite.toast.toggleFailed") },
        onMutate: async () => {
            await qc.cancelQueries({ queryKey: favoritedOptions(productId).queryKey })
            const prev = qc.getQueryData<boolean>(favoritedOptions(productId).queryKey)
            qc.setQueryData(favoritedOptions(productId).queryKey, !prev)
            return { prev }
        },
        onError: (_e, _v, ctx) => {
            qc.setQueryData(favoritedOptions(productId).queryKey, ctx?.prev)
        },
        onSettled: () => qc.invalidateQueries({ queryKey: favoritedOptions(productId).queryKey }),
    })
}
