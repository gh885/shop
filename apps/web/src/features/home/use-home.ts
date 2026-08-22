import { queryOptions, useQuery } from "@tanstack/react-query"

import { fetchBanners, fetchFeedProducts, fetchHomeNav, fetchRecommendTabs } from "./actions"

// 首页内容 5 分钟缓存（运营配置不常变）
const CACHE = 5 * 60_000

/** 共享 queryOptions：route loader 用 ensureQueryData 预热，组件 useQuery 读同一缓存（SSR-query 集成序列化缓存给客户端） */
export const homeNavOptions = queryOptions({
    queryKey: ["home-nav"],
    queryFn: fetchHomeNav,
    staleTime: CACHE,
    retry: false,
})

export const bannersOptions = queryOptions({
    queryKey: ["home-banners"],
    queryFn: fetchBanners,
    staleTime: CACHE,
    retry: false,
})

export const recommendTabsOptions = queryOptions({
    queryKey: ["home-recommend-tabs"],
    queryFn: fetchRecommendTabs,
    staleTime: CACHE,
    retry: false,
})

export const feedOptions = queryOptions({
    queryKey: ["home-feed"],
    queryFn: fetchFeedProducts,
    retry: false,
})

/** 首页分类导航 */
export function useHomeNav() {
    return useQuery(homeNavOptions)
}

/** 首页运营位 banner */
export function useBanners() {
    return useQuery(bannersOptions)
}

/** 首页推荐条词条 */
export function useRecommendTabs() {
    return useQuery(recommendTabsOptions)
}

/** 首页商品流 */
export function useFeedProducts() {
    return useQuery(feedOptions)
}
