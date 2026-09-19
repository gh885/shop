import { MutationCache, QueryClient, type DefaultOptions } from "@tanstack/react-query"

import { notify } from "./notify"

/**
 * 应用级 QueryClient 的唯一构造口（三个 app 共用同一套默认值）。
 *
 * 为什么必须统一：默认值决定「忘写 staleTime 的查询」的行为，而这是最容易发生的事。
 * 三端各 new 一个裸 QueryClient 时，同一个 `useQuery` 在 web 有 10s 兜底、在 seller/admin
 * 变成 mount 即 refetch —— 表现是「这个页面每次切回来都闪一下」，且只在部分端出现，
 * 排查时没人会想到是入口文件里少了两行配置。
 *
 * **这个文件是「默认该做的事」的唯一落点**，读写两侧各一件，形状刻意对称：
 *
 * | | 默认（本文件） | 逐点声明 | 显式退出 |
 * | --- | --- | --- | --- |
 * | 查询失败 | `queries.throwOnError` | — | `throwOnError: false` |
 * | 写操作失败提示 | `mutationCache.onError` | `meta.error` 兜底文案 | `meta.silentError` |
 * | 写操作成功提示 | `mutationCache.onSuccess` | `meta.success` | 不填 `success` |
 * | 写操作后果 | — | `meta.invalidates` / 库自己的 `onSuccess` | — |
 *
 * 共同的口径是**「默认吵、退出要显式」**：忘写声明的后果是「多提示一次/多抛一层」，而不是
 * 「静默不生效」。反过来（默认安静）时，漏一处声明的表现是页面数据陈旧、且没人会注意到，
 * 那才是真正难定位的一类 bug。
 *
 * 另外定：`queries` 只做保守兜底，不是全局新鲜度策略：
 * - `staleTime: 10s` 挡住 mount 即重拉，同时短到不会让列表明显过期；需要即时性的查询
 *   （结算预览这类）在自己的 queryOptions 里显式写 `staleTime: 0`，per-query 覆盖优先于此处。
 * - `retry` 保持库默认（3 次指数退避）：字典/列表类查询的瞬时抖动应能自愈；要「失败即报」
 *   的查询（404 有业务含义的详情）在自己的 queryOptions 里写 `retry: false`。
 */
export function createAppQueryClient(overrides: AppQueryClientOverrides = {}): QueryClient {
    return new QueryClient({
        /**
         * 写操作的全局反馈。用官方的 `MutationCache`（而不是包一层 hook 工厂）：
         * 它一次接好就对**所有** mutation 生效，且回调的第 5 参就是
         * `MutationFunctionContext = { client, meta, mutationKey }` —— 不用闭包捕获 QueryClient。
         *
         * 顺序：全局回调**先于**逐点回调（`mutation.ts` onSuccess 241→249 / onError 279→291），
         * 所以这里的失效发生在调用方自己的 `onSuccess`（回填缓存、关弹窗）之前，
         * 与「先声明后果、再做本地善后」的直觉一致。
         */
        mutationCache: new MutationCache({
            onSuccess: (_data, _variables, _onMutateResult, mutation, { client }) => {
                const meta = mutation.options.meta
                if (meta?.success) notify.success(meta.success)
                for (const queryKey of meta?.invalidates ?? []) {
                    void client.invalidateQueries({ queryKey })
                }
            },
            onError: (error, _variables, _onMutateResult, mutation) => {
                const meta = mutation.options.meta
                // 表单内联报错这类自己处理错误的写操作显式退出（见 MutationMeta.silentError）
                if (meta?.silentError) return
                notify.fromError(error, meta?.error)
            },
        }),
        defaultOptions: {
            queries: {
                staleTime: 10_000,
                throwOnError: throwWhenNoData,
                ...overrides.queries,
            },
            mutations: { ...overrides.mutations },
        },
    })
}

/**
 * 逐项覆盖应用默认值（只在**测试装置**里用）。
 *
 * 存在的原因：测试要确定性（禁 retry），但**不能因此丢掉应用默认值**——否则
 * `throwOnError`、写操作的全局 toast 这些「生产里一定生效」的行为在测试里根本走不到，
 * 于是测试只能证明「这套默认值不存在时一切正常」。各 app 的 `src/test/render.tsx` 用
 * `createAppQueryClient({ queries: { retry: false }, mutations: { retry: false } })` 建测试客户端，
 * 拿到的是真实默认值 + 确定的重试策略。
 *
 * 放在这里而不是 `@shop/test-utils`：那会让 test-utils 反向依赖 app-kit，
 * 而 `@shop/app-kit` 的 devDependencies 已经依赖 test-utils，成环。
 */
export interface AppQueryClientOverrides {
    queries?: DefaultOptions["queries"]
    mutations?: DefaultOptions["mutations"]
}

/**
 * `throwOnError` 的官方语义化写法：**只在「一条数据都没有可展示」时**才把错误抛给错误边界。
 *
 * 直接用 `true` 会在「有旧数据的后台重取失败」时也抛——把一屏本来能看的旧内容换成整页错误页。
 * 这不是自创判据：它逐字等于 TanStack Query 给 suspense 查询用的内部默认
 * （`@tanstack/react-query` 的 `suspense.ts`：`defaultThrowOnError = (_error, query) => query.state.data === undefined`，
 * 由 `useSuspenseQuery` 塞进 options 覆盖客户端默认值）。该符号虽从库内部模块导出，
 * 但包入口的 exports 只放行 `"."`，深路径 import 不可行，所以只能复制复用（5.101 源码实测）。
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
