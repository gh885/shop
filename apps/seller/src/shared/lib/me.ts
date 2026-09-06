import { queryOptions, useQuery } from "@tanstack/react-query"

import { AuthApi } from "@shop/api/sdk"

import { useAuthStatus } from "./api"

/** 当前用户缓存 key（登录/登出场景的失效入口） */
export const ME_QUERY_KEY = ["me"] as const

const meQueryOptions = queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: () => AuthApi.me(),
    staleTime: 5 * 60_000,
    retry: false,
})

/** 当前登录用户信息（未登录时不发请求） */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({ ...meQueryOptions, enabled: status === "authed" })
}
