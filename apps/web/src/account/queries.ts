import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthApi, type MeResponse } from "@shop/api/sdk"

import { useAuthStatus } from "#/shared/api/auth"

/**
 * user/queries —— 当前登录用户的 React 接线层。这里只管读写。
 * 直接返回 SDK 的 MeResponse（字段可选），组件按需 Pick 自己渲染的字段；
 * 登录态由 auth-kit gate；未登录（guest）不发请求。
 *
 */

/** 当前用户缓存 key（登录/登出/资料更新的失效入口，profile 页也引用它） */
export const ME_QUERY_KEY = ["me"] as const

const meQueryOptions = queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<MeResponse | undefined> => AuthApi.me(),
    staleTime: 5 * 60_000,
    retry: false,
})

/** 当前登录用户信息（未登录时不发请求） */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({ ...meQueryOptions, enabled: status === "authed" })
}

/** 登出等场景下清除缓存的用户信息 */
export function useClearMe() {
    const queryClient = useQueryClient()
    return () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
}
