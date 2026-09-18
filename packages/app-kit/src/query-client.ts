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
 * - `throwOnError: throwWhenNoData`（见下）—— 默认「失败交给错误边界」，**区块级查询要显式退出**。
 */
export function createAppQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 10_000,
                throwOnError: throwWhenNoData,
            },
        },
    })
}

/**
 * `throwOnError` 的官方语义化写法：**只在「一条数据都没有可展示」时**才把错误抛给错误边界。
 *
 * 直接用 `true` 会在「有旧数据的后台重取失败」时也抛——把一屏本来能看的旧内容换成整页错误页。
 * 这不是自创判据：它逐字等于 TanStack Query 给 suspense 查询用的内部默认
 * （`@tanstack/react-query` 的 `suspense.ts`：`(_error, query) => query.state.data === undefined`），
 * 我们只是把它从库内部搬出来复用（那个符号没有公开导出）。
 *
 * **本函数是全局默认**（`createAppQueryClient` 的 `defaultOptions.queries`）。两条推论：
 *
 * 1. **`useSuspenseQuery` 不受它影响**：官方把 `throwOnError` 从 suspense 那份 options 的类型里 `Omit` 掉了，
 *    并在运行时用自己的同名判据覆盖（`useSuspenseQuery.ts` 把 `defaultThrowOnError` 放进传给
 *    `useBaseQuery` 的 options，合并时后写的覆盖客户端默认值）。所以给 suspense 查询写 `throwOnError: false`
 *    不是「退出」——内联写是类型错误，传 options 变量是静默失效。
 * 2. **区块级查询必须显式退出**：默认抛错意味着「头上必须有个边界接住」。页头角标、收藏心形、
 *    可领券入口、弹窗/向导内部件这些都挂在页面主体之外，头上没有 `errorComponent` 也没有
 *    `QueryBoundary`——父容器的设计往往是「拿不到就不画这一块」（如 seller 的待确认邀请
 *    `if (!data) return`）。这类查询在自己的 queryOptions 里写 `throwOnError: false`，
 *    失败就地渲染并在有需要时用官方 `refetch()` 重试。
 *
 * 判据与例外清单见 AGENTS.md「错误与重试」。
 */
export function throwWhenNoData(_error: unknown, query: { state: { data: unknown } }): boolean {
    return query.state.data === undefined
}
