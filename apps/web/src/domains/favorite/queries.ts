import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FavoriteControllerApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { toFavoriteItem } from "./mapper"
import { type FavoriteItem } from "./rules"

const KEY = ["favorite-items"] as const

export const favoriteItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<FavoriteItem[]> => {
        const page = await FavoriteControllerApi.listFavorites({ query: { limit: 100 }, signal })
        return page.items.map(toFavoriteItem)
    },
})

export function useRemoveFavorites() {
    return useMutation(
        optimisticListMutationOptions<FavoriteItem, string[]>({
            queryKey: KEY,
            mutationFn: (spuIds) =>
                Promise.all(
                    spuIds.map((id) =>
                        FavoriteControllerApi.removeFavorite({ path: { spuId: id } }),
                    ),
                ),
            patch: (list, spuIds) => {
                const removed = new Set(spuIds)
                return list.filter((item) => !removed.has(item.spuId))
            },
            meta: { error: message("favorite.toast.removeFailed") },
        }),
    )
}

const favoritedOptions = (spuId: string) =>
    queryOptions({
        queryKey: ["favorite-status", spuId] as const,
        queryFn: async ({ signal }) => {
            const res = await FavoriteControllerApi.exists({
                body: { spuIds: [spuId] },
                signal,
            })
            return res.favoritedSpuIds.includes(spuId)
        },
        staleTime: 30_000,
        throwOnError: false,
    })

export function useFavoriteStatus(spuId: string) {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...favoritedOptions(spuId), enabled: isLoggedIn })
}

export function useToggleFavorite(spuId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (favorited: boolean) => {
            if (favorited) await FavoriteControllerApi.removeFavorite({ path: { spuId } })
            else await FavoriteControllerApi.addFavorite({ path: { spuId } })
            return !favorited
        },
        meta: { error: message("favorite.toast.toggleFailed") },
        onMutate: async () => {
            await qc.cancelQueries({ queryKey: favoritedOptions(spuId).queryKey })
            const prev = qc.getQueryData<boolean>(favoritedOptions(spuId).queryKey)
            qc.setQueryData(favoritedOptions(spuId).queryKey, !prev)
            return { prev }
        },
        onError: (_e, _v, ctx) => {
            qc.setQueryData(favoritedOptions(spuId).queryKey, ctx?.prev)
        },
        onSettled: () => qc.invalidateQueries({ queryKey: favoritedOptions(spuId).queryKey }),
    })
}
