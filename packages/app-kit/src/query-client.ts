import { QueryClient } from "@tanstack/react-query"

/**
 * 应用级 QueryClient 的唯一构造口（三个 app 共用同一套默认值）。
 *
 * 为什么必须统一：默认值决定「忘写 staleTime 的查询」的行为，而这是最容易发生的事。
 * 三端各 new 一个裸 QueryClient 时，同一个 `useQuery` 在 web 有 10s 兜底、在 seller/admin
 * 变成 mount 即 refetch —— 表现是「这个页面每次切回来都闪一下」，且只在部分端出现，
 * 排查时没人会想到是入口文件里少了两行配置。
 *
 * 默认值只做保守兜底，不是全局新鲜度策略：
 * - `staleTime: 10s` 挡住 mount 即重拉，同时短到不会让列表明显过期；需要即时性的查询
 *   （结算预览这类）在自己的 queryOptions 里显式写 `staleTime: 0`，per-query 覆盖优先于此处。
 * - `retry` 保持库默认（3 次指数退避）：字典/列表类查询的瞬时抖动应能自愈；要「失败即报」
 *   的查询（404 有业务含义的详情）在自己的 queryOptions 里写 `retry: false`。
 */
export function createAppQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 10_000,
            },
        },
    })
}

/**
 * `throwOnError` 的官方语义化写法：**只在「一条数据都没有可展示」时**才把错误抛给错误边界。
 *
 * 直接用 `true` 会在「有旧数据的后台重取失败」时也抛——把一屏本来能看的旧内容换成整页错误页。
 * TanStack Query 对 suspense 查询的默认判据正是这一条（`typeof query.state.data === 'undefined'`），
 * 这里抽出来供两处复用：逐 query 写在 `queryOptions` 里，或作为
 * `defaultOptions.queries.throwOnError` 全局默认（当前按页面迁移进度逐个显式开启，见 AGENTS.md）。
 */
export function throwWhenNoData(_error: unknown, query: { state: { data: unknown } }): boolean {
    return query.state.data === undefined
}
