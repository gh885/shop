import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FavoritesApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { useOptimisticListMutation } from "#/shared/lib/use-optimistic-list"

import { toFavoriteItem, type FavoriteItem } from "./favorite"

/**
 * use-favorite —— 收藏的 React 接线层。只管「读状态/写状态」，规则在 ./favorite.ts 纯函数里。
 * 状态分两块、互不直接同步：
 * - 列表（收藏页）：useFavorites + useRemoveFavorites（乐观移除，为它留 query）
 * - 详情页心形（useFavoriteStatus / useToggleFavorite）：按 productId 独立 query，乐观切换
 */

// ---------- 列表（收藏页） ----------

const KEY = ["favorite-items"] as const

async function fetchFavorites(): Promise<FavoriteItem[]> {
    const res = await FavoritesApi.listFavorites({ query: { pageParams: { page: 1, size: 100 } } })
    return (res.data?.records ?? []).map(toFavoriteItem)
}

export const favoriteItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: fetchFavorites,
})

export function useFavorites() {
    return useQuery(favoriteItemsOptions)
}

/** 移除收藏：单条与批量共用（按 productId，收藏是幂等开关、非行管理），乐观更新 */
export function useRemoveFavorites() {
    return useOptimisticListMutation<FavoriteItem, string[]>({
        queryKey: KEY,
        mutationFn: (productIds) =>
            Promise.all(
                productIds.map((id) => FavoritesApi.removeFavorite({ path: { productId: id } })),
            ),
        patch: (list, productIds) => list.filter((item) => !productIds.includes(item.productId)),
        messages: { error: "移出收藏失败" },
    })
}

// ---------- 详情页心形（单商品） ----------

/** 该商品是否已收藏：详情页心形状态用；未登录不发请求（公开详情页可匿名访问） */
export function useFavoriteStatus(productId: string) {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({
        queryKey: ["favorite-status", productId],
        queryFn: async () => {
            const res = await FavoritesApi.checkFavoriteExists({
                body: { productIds: [productId] },
            })
            return (res.data?.productIds ?? []).includes(productId)
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
    })
}

/** 收藏/取消收藏开关：详情页心形按钮用，乐观切换、失败回滚。
 * 调用方传入<b>点击前</b>的当前状态（来自 useFavoriteStatus），判定该发 add 还是 remove——
 * 不读被乐观更新污染后的 cache，否则未收藏时点收藏会误判为已收藏而发 DELETE。 */
export function useToggleFavorite(productId: string) {
    const qc = useQueryClient()
    return useMutation({
        // favorited = 点击前是否已收藏；据此决定 add / remove
        mutationFn: async (favorited: boolean) => {
            if (favorited) await FavoritesApi.removeFavorite({ path: { productId } })
            else await FavoritesApi.addFavorite({ body: { productId } })
            return !favorited
        },
        onMutate: async () => {
            await qc.cancelQueries({ queryKey: ["favorite-status", productId] })
            const prev = qc.getQueryData<boolean>(["favorite-status", productId])
            qc.setQueryData(["favorite-status", productId], !prev)
            return { prev }
        },
        onError: (_e, _v, ctx) => {
            qc.setQueryData(["favorite-status", productId], ctx?.prev)
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["favorite-status", productId] }),
    })
}
