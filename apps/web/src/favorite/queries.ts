import { message } from "#/locales/message"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FavoritesApi } from "@shop/api/sdk"

import { useIsLoggedIn } from "#/shared/api/auth"
import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { toFavoriteItem } from "./mapper"
import { type FavoriteItem } from "./favorite"

/**
 * favorite/queries —— 收藏的 React 接线层。只管「读状态/写状态」，规则在 ./favorite.ts 纯函数里。
 * 状态分两块、互不直接同步：
 * - 列表（收藏页）：favoriteItemsOptions + useRemoveFavorites（乐观移除，为它留 query）
 * - 详情页心形（useFavoriteStatus / useToggleFavorite）：按 productId 独立 query，乐观切换
 */

// 列表（收藏页）
/** 收藏页列表缓存 key（乐观移除的 patch 目标） */
const KEY = ["favorite-items"] as const
const FAVORITES_QUERY = { query: { pageParams: { page: 1, size: 100 } } } as const

/** 收藏页列表；导出供 route loader 客户端预热，组件直接 `useQuery(favoriteItemsOptions)` */
export const favoriteItemsOptions = queryOptions({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<FavoriteItem[]> => {
        const res = await FavoritesApi.listFavorites({ ...FAVORITES_QUERY, signal })
        return res.records.map(toFavoriteItem)
    },
})

/** 移除收藏：单条与批量共用（按 productId，收藏是幂等开关、非行管理），乐观更新 */
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
            meta: { error: message("web.favorite.toast.removeFailed") },
        }),
    )
}

// 详情页心形（单商品）
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
        // 退出全局的「失败抛给错误边界」：心形是详情页上的一个按钮，读不到就按未收藏渲染
        // （调用方 `const { data: favorited = false }`）。抛出去会把商品详情整页换成错误页
        throwOnError: false,
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
        // 失败提示走全局（meta.error 是兜底文案，后端 detail 优先），这里只管回滚
        meta: { error: message("web.favorite.toast.toggleFailed") },
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
