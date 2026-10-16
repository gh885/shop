import { useEffect } from "react"
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

import { setMonitoringUser } from "@shop/monitoring"
import { type AuthStatus } from "@shop/client" /** 三端 me 查询工厂：key/新鲜度/enabled 唯一形态，防缓存漂移；见 docs/conventions/frontend.md「服务端状态」与 query-convergence.md。 */
interface MeQueryConfig<TMe> {
    scope: string
    queryFn: () => Promise<TMe>
    /** 本端 authKit 实例，必须由调用方注入，不能从 common 取 */
    useAuthStatus: () => AuthStatus
    /** 默认 5 分钟：资料页更新后自行 invalidate */
    staleTime?: number
    /** 监控信封 userId 取值器，可选；挂在 me 而非登录/登出的理由见 docs/conventions/frontend-monitoring.md */
    userIdOf?: (me: TMe) => string | undefined
}

interface MeQuery<TMe> {
    ME_QUERY_KEY: readonly [string]
    useMe: () => UseQueryResult<TMe>
    useClearMe: () => () => void
}

export function createMeQuery<TMe>({
    scope,
    queryFn,
    useAuthStatus,
    staleTime = 5 * 60_000,
    userIdOf,
}: MeQueryConfig<TMe>): MeQuery<TMe> {
    const ME_QUERY_KEY = [scope] as const

    function useMe() {
        const status = useAuthStatus()
        // queryFn 保持内联：包一层 queryOptions 会破坏 key 元组的泛型推断（TS2769），不可提升
        // oxlint-disable-next-line tanstack-query/prefer-query-options -- 见上：wrapper 会破坏 key 元组推断
        const query = useQuery<TMe>({
            queryKey: ME_QUERY_KEY,
            queryFn,
            staleTime,
            retry: false,
            enabled: status === "authed",
            // me 的消费者（页头/布局展示件）头上没有边界，绝不能把整应用外壳换成错误页
            throwOnError: false,
        })

        // setMonitoringUser 是副作用，放 effect 里避免渲染期双写；依赖只列 query.data（userIdOf 闭包内恒定）
        useEffect(() => {
            if (userIdOf)
                setMonitoringUser(query.data === undefined ? undefined : userIdOf(query.data))
        }, [query.data])
        return query
    }

    function useClearMe() {
        const queryClient = useQueryClient()
        return () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
    }

    return { ME_QUERY_KEY, useMe, useClearMe }
}
