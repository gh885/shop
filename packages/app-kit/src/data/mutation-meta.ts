import type { QueryKey } from "@tanstack/react-query"

import type { ToastText } from "./toast-text"

/**
 * 写操作的「声明面」——挂在 TanStack Query **官方留的 `meta` 通道**上，而不是自造一套 options 名。
 *
 * 反馈（成功/失败 toast）是全局同构的，收进 `createAppQueryClient()` 的 `MutationCache`；「这份回执
 * 改变了什么」是逐点数据，借 `meta` 的一个字段表达。两样都用，所以调用点只多一个 `meta`：
 * ```ts
 * useMutation({
 *     mutationFn: (orderId: string) => OrdersApi.cancelOrder({ path: { id: orderId } }),
 *     meta: { success: message("seller.order.toast.cancelled"), error: message("seller.order.toast.cancelFailed"), invalidates: [MY_ORDERS_KEY] },
 * })
 * ```
 *
 * 类型上走官方的 `Register` 增强（`types.ts` 里 `Register` 预留了 `mutationMeta` 注释位），所以拼错
 * 字段名**编译不过**。选它的完整理由见 docs/conventions/frontend.md「写操作」与
 * docs/conventions/query-convergence.md §3。
 */
export interface MutationMeta extends Record<string, unknown> {
    /**
     * 成功提示文案。**不填即不提示**——购物车里的勾选/改数量这类高频操作不需要回执，
     * 每次弹一条会把屏幕刷满。「要不要提示」由这个字段的有/无承载，
     * 所以没有 `silentSuccess` 这种东西（存在两个开关时，二者矛盾就是必然的 bug 来源）。
     *
     * 只收 catalog 工厂产出的 `CheckedMessageFact`：句子在 `MutationCache` 触发那一刻按 `localeOf(i18n)` 现取（i18n.md §6.1
     * 那条「存事实、边界换句子」）。裸串与手写对象都不能绕过构造处的 key/参数校验。
     */
    success?: ToastText
    /**
     * 失败兜底文案。后端有 `detail` 时以 `detail` 为准，只有网络层错误（status 0）才用它
     * （策略在 `notify.fromError`，本文件不重复实现）。形态同 `success`：只收 catalog 工厂产出的 `CheckedMessageFact`。
     */
    error?: ToastText
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
