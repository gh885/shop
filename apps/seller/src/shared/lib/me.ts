import { useQuery, useQueryClient } from "@tanstack/react-query"

import { me } from "./auth-data"
import { useAuthStatus } from "./api"

const ME_QUERY_KEY = ["me"] as const

/** 当前登录用户信息（未登录时不发请求） */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: () => me(),
        enabled: status === "authed",
        staleTime: 5 * 60_000,
        retry: false,
    })
}

/** 登出等场景下清除缓存的用户信息 */
export function useClearMe() {
    const queryClient = useQueryClient()
    return () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
}
