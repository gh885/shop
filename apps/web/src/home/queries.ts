import { queryOptions } from "@tanstack/react-query"

import { CmsPublicApi } from "@shop/api/sdk"

import { withContractFallback } from "#/shared/lib/contract-fallback"

import { fetchBanners, fetchFeedProducts, fetchHomeNav } from "./actions"

// 首页内容 5 分钟缓存（运营配置不常变）
const CACHE = 5 * 60_000

/** 共享 queryOptions：route loader 用 query() 预热，组件 useQuery 读同一缓存（SSR-query 集成序列化缓存给客户端） */
export const homeNavOptions = queryOptions({
    queryKey: ["home-nav"],
    queryFn: withContractFallback(
        () => fetchHomeNav(),
        () => [],
    ),
    staleTime: CACHE,
    retry: false,
})

export const bannersOptions = queryOptions({
    queryKey: ["home-banners"],
    queryFn: withContractFallback(
        () => fetchBanners(),
        () => [],
    ),
    staleTime: CACHE,
    retry: false,
})

export const recommendTabsOptions = queryOptions({
    queryKey: ["home-recommend-tabs"],
    // 契约字段同名同型，直接用 SDK 类型，不做恒等投影
    queryFn: withContractFallback(
        () => CmsPublicApi.getRecommendTabs(),
        () => [],
    ),
    staleTime: CACHE,
    retry: false,
})

/** 首页商品流：SSR 流式版。loader 不预热该查询，组件 useSuspenseQuery 挂起边界，
 * SSR 先吐骨架壳，feed resolve 后经 queryStream 流给客户端 hydrate（见 route loader 注释） */
export const feedOptions = queryOptions({
    queryKey: ["home-feed"],
    queryFn: withContractFallback(
        () => fetchFeedProducts(),
        () => [],
    ),
    retry: false,
})
