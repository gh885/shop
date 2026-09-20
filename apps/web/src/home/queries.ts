import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

import { CmsPublicApi, FeedApi, type RecommendTabResponse } from "@shop/api/sdk"

import { toProduct, type Product } from "#/products"

// 首页内容 5 分钟缓存（运营配置不常变）
const CACHE = 5 * 60_000

// 首页壳区块（导航 / banner / 推荐词条）共用口径：5 分钟缓存 + 失败即报 + **不抛错误边界**。
// 首页是门面，单个接口失败绝不能把整页换成错误页（loader 的 allSettled 就是同一条意图）：
// 读不到就不画这一块。三个查询都是 useQuery 常规读取，所以必须逐条显式退出全局默认。
//
// 失败（含「2xx 但不符合契约」的 zod 校验失败）统一以 error 态交给消费点，
// 由消费点按 isError 渲染空态/不画——不在 queryFn 里伪造兜底数据：
// 那会在 dev/prod 之间分叉行为（dev 抛、生产吞），且只挡契约漂移一种失败，5xx/网络照样漏网。
//
// 三个壳查询的 payload 契约字段同名同型，直接用 SDK 生成类型，不做镜像类型与恒等投影。

/** 共享 queryOptions：route loader 用 query() 预热，组件 useQuery 读同一缓存（SSR-query 集成序列化缓存给客户端） */
export const homeNavOptions = queryOptions({
    queryKey: ["home-nav"],
    queryFn: () => CmsPublicApi.getHomeNav({ query: { navKey: "home" } }),
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

export const bannersOptions = queryOptions({
    queryKey: ["home-banners"],
    queryFn: () => CmsPublicApi.getHomeBanners({ query: { slot: "home_promo" } }),
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

export const recommendTabsOptions = queryOptions({
    queryKey: ["home-recommend-tabs"],
    queryFn: () => CmsPublicApi.getRecommendTabs(),
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

// ---------- 首页商品流（feed）----------

/**
 * tab → 召回范围：只有 `CATEGORY` 型词条才圈定类目，其余（搜索型 / 无目标）一律全站。
 * 纯函数放在数据层、由区块组件调用：这个词条在测试里被断得最细，而它在组件里就一行三元表达式。
 */
export function feedCategoryId(tab: RecommendTabResponse | undefined): string | undefined {
    return tab?.targetType === "CATEGORY" ? (tab.target ?? undefined) : undefined
}

/** 一页 24 条（六列四行）；48 的上限由后端 @Max 兜底，前端不重复表达 */
export const FEED_PAGE_SIZE = 24

/**
 * feed 一页：与列表接口不同形——没有 total，只有「nextCursor 为 null」这一种收口。
 * 取数函数与它的 query key 同住本文件（frontend.md：key 归属 = 域）：首页商品流不是商品域的取数，
 * 放进 products/detail 只会让那份文件变成第三个推荐取数的堆放处。
 */
export async function fetchFeed(
    input: { categoryId?: string; cursor?: string; size?: number },
    signal?: AbortSignal,
): Promise<{ items: Product[]; nextCursor: string | null }> {
    const page = await FeedApi.listHomeFeed({
        query: { query: { categoryId: input.categoryId, cursor: input.cursor, size: input.size } },
        signal,
    })
    return { items: page.items.map(toProduct), nextCursor: page.nextCursor }
}

/**
 * 首页商品流：仓库第一个无限查询，首屏仍是 SSR 流式（loader 不预热该查询，组件挂起边界，
 * 第一页 resolve 后经 queryStream 流给客户端水合）。
 *
 * <p>缓存只在两种情况下换：「换一批」（resetQueries）与整页重载。所以 staleTime 是 Infinity，
 * 并关掉窗口聚焦 / 重连重取——商品卡在新标签页打开，用户看完商品切回首页就是一次窗口聚焦，
 * 默认重取会把已加载页串行重拉，且第一页无游标 → 新种子 → **整页换序**，恰好发生在用户回来继续逛的那一刻。
 *
 * <p>切 tab 的「不闪」不在这里：{@code useSuspenseInfiniteQuery} 在实现里硬写了
 * {@code placeholderData: void 0}（suspense 版刻意不吃占位数据），所以「保留上一批卡片」只能靠
 * React 的 transition 完成——见 home/Feed.tsx 的 startTransition。
 */
export const feedOptions = (categoryId?: string) =>
    infiniteQueryOptions({
        queryKey: ["home-feed", categoryId ?? "all"],
        queryFn: ({ pageParam, signal }) =>
            fetchFeed({ categoryId, cursor: pageParam, size: FEED_PAGE_SIZE }, signal),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        // 拍平 + 按 id 去重：既防 React key 冲突，也是将来加权排序（商品跨游标移动）的兜底
        select: (data) => {
            const seen = new Set<string>()
            const items: Product[] = []
            for (const page of data.pages) {
                for (const item of page.items) {
                    if (seen.has(item.id)) continue
                    seen.add(item.id)
                    items.push(item)
                }
            }
            return { items, pageCount: data.pages.length }
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
    })
