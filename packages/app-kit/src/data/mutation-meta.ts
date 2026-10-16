import type { QueryKey } from "@tanstack/react-query"

import type { ToastText } from "./toast-text"

/** 写操作声明面，走官方 `Register` 增强（拼错字段名编译不过）；理由与四条硬规矩见 docs/conventions/frontend.md「写操作」与 query-convergence.md §3 */
export interface MutationMeta extends Record<string, unknown> {
    /** 成功提示；不填即不提示，「要不要提示」由本字段有/无承载，所以没有 silentSuccess */
    success?: ToastText
    /** 失败兜底：仅网络层错误（status 0）时用，后端 detail 优先（策略在 notify.fromError） */
    error?: ToastText
    /** 逐点 onError 拦不住全局 toast（全局回调先执行，mutation.ts onError 279 vs 291），只能经 meta 声明 */
    silentError?: boolean
    /** 传真实 query key（前缀匹配命中子树）；刻意不做 tag→key 映射表，防第二棵命名树 */
    invalidates?: readonly QueryKey[]
}

declare module "@tanstack/react-query" {
    interface Register {
        mutationMeta: MutationMeta
    }
}
