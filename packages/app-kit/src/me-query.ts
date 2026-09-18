import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

import type { AuthStatus } from "@shop/common"

/**
 * 「当前登录者」查询的工厂（三个 app 共用一套 key 与新鲜度）。
 *
 * 为什么在 app-kit 而不是各 app 的 shared/lib：三端的 me 查询**形态完全相同**
 * （authed 才发请求、5 分钟新鲜度、失败不重试），差异只有两处装配参数 ——
 * 请求方法（C 端 `AuthApi.me` / admin `AdminAuthApi.getStaffMe`）与登录态 hook
 * （各 app 自建 authKit 的 `useAuthStatus`）。这种「同一份数据在多个应用里各写一遍」
 * 是缓存漂移的温床：staleTime、retry、enabled 条件任一处复制时写错，表现是
 * 「登出后 seller 还显示昵称」这类只在单端出现、且极难定位的问题。
 *
 * key 里带 `scope`（web/seller 为 "me"，admin 为 "admin/me"）是刻意保留的：
 * 它与后端端点一一对应（/user/me vs /admin/auth/me），未来若把三端放进同一个
 * QueryClient（例如微前端式装配），不同端点的 me 不会串成一份缓存。
 */
export interface MeQueryConfig<TMe> {
    /** 查询 key 的业务前缀（"me" / "admin/me"）：与后端端点一一对应 */
    scope: string
    /** 拉取当前登录者；401 由 SDK 归一为抛错，工厂按失败处理 */
    queryFn: () => Promise<TMe>
    /** 本端 authKit 的 useAuthStatus（各 app 各一份实例，必须由调用方注入，不能从 common 取） */
    useAuthStatus: () => AuthStatus
    /** 新鲜度，默认 5 分钟：身份信息变更频率低，且资料页更新后自行 invalidate */
    staleTime?: number
}

export interface MeQuery<TMe> {
    /** 缓存前缀：登录/登出/资料更新后的失效入口 */
    ME_QUERY_KEY: readonly [string]
    /** 当前登录者（未登录不发请求） */
    useMe: () => UseQueryResult<TMe>
    /** 登出等场景下清除缓存的用户信息 */
    useClearMe: () => () => void
}

export function createMeQuery<TMe>({
    scope,
    queryFn,
    useAuthStatus,
    staleTime = 5 * 60_000,
}: MeQueryConfig<TMe>): MeQuery<TMe> {
    const ME_QUERY_KEY = [scope] as const

    function useMe() {
        const status = useAuthStatus()
        // queryFn 在此处内联（不提升到工厂作用域）：key 元组形状要在 hook 调用点固定，
        // 提前抽成独立函数会让 key 的推断跑偏，锁死与 useQuery 的兼容性。
        // 实测：换成 queryOptions(...) 包一层后，queryKey 的 readonly [string] 与 useQuery<TMe>
        // 的泛型推断打架（TS2769：readonly unknown[] 不可赋值给 readonly [string]），故保持内联并豁免。
        // oxlint-disable-next-line tanstack-query/prefer-query-options -- 见上：wrapper 会破坏 key 元组推断
        return useQuery<TMe>({
            queryKey: ME_QUERY_KEY,
            queryFn,
            staleTime,
            retry: false,
            enabled: status === "authed",
        })
    }

    function useClearMe() {
        const queryClient = useQueryClient()
        return () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
    }

    return { ME_QUERY_KEY, useMe, useClearMe }
}
