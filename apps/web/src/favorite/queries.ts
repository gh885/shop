import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FavoritesApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"
import { useOptimisticListMutation } from "#/shared/lib/use-optimistic-list"

import { toFavoriteItem, type FavoriteItem } from "./favorite"

/**
 * favorite/queries —— 收藏的 React 接线层。只管「读状态/写状态」，规则在 ./favorite.ts 纯函数里。
 * 状态分两块、互不直接同步：
 * - 列表（收藏页）：useFavorites + useRemoveFavorites（乐观移除，为它留 query）
 * - 详情页心形（useFavoriteStatus / useToggleFavorite）：按 productId 独立 query，乐观切换
 */

// ---------- 列表（收藏页） ----------

/** 收藏页列表缓存 key（乐观移除的 patch 目标） */
const KEY = ["favorite-items"] as const
const FAVORITES_QUERY = { query: { pageParams: { page: 1, size: 100 } } } as const

const favoriteItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<FavoriteItem[]> =>
        (await FavoritesApi.listFavorites({ ...FAVORITES_QUERY, signal })).records.map(
            toFavoriteItem,
        ),
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

// ---------- 详情页心形（单商品） ----------

/** 心形状态 query 的 key 工厂：useFavoriteStatus 与 useToggleFavorite 必须同源。
 * checkFavoriteExists 是 POST，生成器不产出 queryKey，故本地定义。 */
/** 心形状态 query：key 与 options 同源（useToggleFavorite 的乐观更新复用同一 key）。
 * checkFavoriteExists 是 POST，生成器不产出 queryKey，故本地定义。 */
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
    })

/** 该商品是否已收藏：详情页心形状态用；未登录不发请求（公开详情页可匿名访问） */
export function useFavoriteStatus(productId: string) {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...favoritedOptions(productId), enabled: isLoggedIn })
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
            await qc.cancelQueries({ queryKey: favoritedOptions(productId).queryKey })
            const prev = qc.getQueryData<boolean>(favoritedOptions(productId).queryKey)
            qc.setQueryData(favoritedOptions(productId).queryKey, !prev)
            return { prev }
        },
        onError: (_e, _v, ctx) => {
            qc.setQueryData(favoritedOptions(productId).queryKey, ctx?.prev)
            notify.fromError(_e, "收藏操作失败，请重试")
        },
        onSettled: () => qc.invalidateQueries({ queryKey: favoritedOptions(productId).queryKey }),
    })
}
