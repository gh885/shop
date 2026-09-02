import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthApi, type MeResponse } from "@shop/api/sdk"

import { useAuthStatus } from "#/shared/api/auth"

/**
 * use-user —— 当前登录用户的 React 接线层。这里只管读写。
 * 直接返回 SDK 的 MeResponse（字段可选），组件按需 Pick 自己渲染的字段；
 * 登录态由 auth-kit gate；未登录（guest）不发请求。
 */

const ME_QUERY_KEY = ["me"] as const

async function fetchMe(): Promise<MeResponse | undefined> {
    return (await AuthApi.me()).data
}

const meOptions = queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
})

/** 当前登录用户信息（未登录时不发请求） */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({ ...meOptions, enabled: status === "authed" })
}

/** 登出等场景下清除缓存的用户信息 */
export function useClearMe() {
    const queryClient = useQueryClient()
    return () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
}
