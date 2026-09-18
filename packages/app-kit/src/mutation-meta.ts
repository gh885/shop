import type { QueryKey } from "@tanstack/react-query"

/**
 * 写操作的「声明面」——挂在 TanStack Query **官方留的 `meta` 通道**上，而不是自造一套 options 名。
 *
 * 为什么走 `meta`：官方对「mutation 该失效哪些 query」这件事**刻意不表态**
 * （维护者 TkDodo《Automatic Query Invalidation after Mutations》原话：
 * “Since there isn't a one-size-fits-all solution, React Query provides nothing out of the box”），
 * 但它把两个扩展点留了出来——**全局 `MutationCache` 回调**（一次接好、对每个 mutation 生效）
 * 与 **`meta`**（逐点携带声明）。我们两样都用：
 * - 反馈（成功/失败 toast）100% 同构 → 收进 `createAppQueryClient()` 的 `MutationCache`
 * - 「这份回执改变了什么」是逐点的数据、且官方没有对应概念 → 借 `meta` 的一个字段表达
 *
 * 于是调用点写的是**库自己的 `useMutation`**，只多一个 `meta`：
 * ```ts
 * useMutation({
 *     mutationFn: (orderId: string) => OrdersApi.cancelOrder({ path: { id: orderId } }),
 *     meta: { success: "订单已取消", error: "取消订单失败", invalidates: [MY_ORDERS_KEY] },
 * })
 * ```
 *
 * 类型上走官方的 `Register` 增强（`@tanstack/react-query` 的 `types.ts` 里 `Register` 已经预留了
 * `mutationMeta` 注释位，正是给这一步用的），所以 `meta` 是**类型安全**的：拼错字段名编译不过，
 * 不像自由形状的 `Record<string, unknown>` 要到运行时才发现声明没生效。
 */
export interface MutationMeta extends Record<string, unknown> {
    /**
     * 成功提示文案。**不填即不提示**——购物车里的勾选/改数量这类高频操作不需要回执，
     * 每次弹一条会把屏幕刷满。「要不要提示」由这个字段的有/无承载，
     * 所以没有 `silentSuccess` 这种东西（存在两个开关时，二者矛盾就是必然的 bug 来源）。
     */
    success?: string
    /**
     * 失败兜底文案。后端有 `detail` 时以 `detail` 为准，只有网络层错误（status 0）才用它
     * （策略在 `notify.fromError`，本文件不重复实现）。
     */
    error?: string
    /**
     * 该写操作自己渲染/吞掉错误（典型：表单把后端 detail 渲染在字段下方），全局不要 toast。
     *
     * 必须放在 `meta` 里而不是靠逐点 `onError` 抑制：官方 `Mutation.execute` 里**全局回调先于
     * 逐点回调**执行（`mutation.ts` 的 onError 279 行 vs 291 行），逐点 `onError` 跑起来时
     * toast 早就发出去了——想「先拦住」只能让全局能读到声明，而 `meta` 是唯一渠道。
     */
    silentError?: boolean
    /**
     * 这份回执让哪些查询失效。传**真实 query key**（各域 `queries.ts` 的 key 工厂产物），
     * 靠 `invalidateQueries` 的前缀匹配一发命中整棵子树。
     *
     * 刻意不做成「tag → key 映射表」：那等于在 query key 之外再造一棵命名树，
     * 新增读取方时没人会记得补 tag，失效关系照样退化成「记在写代码的人脑子里」。
     */
    invalidates?: readonly QueryKey[]
}

declare module "@tanstack/react-query" {
    interface Register {
        mutationMeta: MutationMeta
    }
}
