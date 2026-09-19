import { queryOptions } from "@tanstack/react-query"

import { CmsPublicApi } from "@shop/api/sdk"

import { toBanner, toNavEntry } from "./model"
import { fetchProducts } from "#/products"

// 首页内容 5 分钟缓存（运营配置不常变）
const CACHE = 5 * 60_000

// 首页壳区块（导航 / banner / 推荐词条）共用口径：5 分钟缓存 + 失败即报 + **不抛错误边界**。
// 首页是门面，单个接口失败绝不能把整页换成错误页（loader 的 allSettled 就是同一条意图）：
// 读不到就不画这一块。三个查询都是 useQuery 常规读取，所以必须逐条显式退出全局默认。
//
// 失败（含「2xx 但不符合契约」的 zod 校验失败）统一以 error 态交给消费点，
// 由消费点按 isError 渲染空态/不画——不在 queryFn 里伪造兜底数据：
// 那会在 dev/prod 之间分叉行为（dev 抛、生产吞），且只挡契约漂移一种失败，5xx/网络照样漏网。

/** 共享 queryOptions：route loader 用 query() 预热，组件 useQuery 读同一缓存（SSR-query 集成序列化缓存给客户端） */
export const homeNavOptions = queryOptions({
    queryKey: ["home-nav"],
    queryFn: async () => {
        const res = await CmsPublicApi.getHomeNav({ query: { navKey: "home" } })
        return res.map(toNavEntry)
    },
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

export const bannersOptions = queryOptions({
    queryKey: ["home-banners"],
    queryFn: async () => {
        const res = await CmsPublicApi.getHomeBanners({ query: { slot: "home_promo" } })
        return res.map(toBanner)
    },
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

export const recommendTabsOptions = queryOptions({
    queryKey: ["home-recommend-tabs"],
    // 契约字段同名同型，直接用 SDK 类型，不做恒等投影
    queryFn: () => CmsPublicApi.getRecommendTabs(),
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

/** 首页商品流：SSR 流式版。loader 不预热该查询，组件 useSuspenseQuery 挂起边界，
 * SSR 先吐骨架壳，feed resolve 后经 queryStream 流给客户端 hydrate（见 route loader 注释）。
 * 失败（含契约漂移）不降级为假数据：交给 QueryBoundary 的错误态 + 官方重试链路 */
export const feedOptions = queryOptions({
    queryKey: ["home-feed"],
    queryFn: async () => {
        const page = await fetchProducts({ page: 1, size: 12, sort: "newest" })
        return page.records
    },
    retry: false,
})
