import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { meOptions as sdkMeOptions, meQueryKey as sdkMeQueryKey } from "@shop/api"

import { useAuthStatus } from "#/shared/api/auth"

/**
 * user/queries —— 当前登录用户的 React 接线层。这里只管读写。
 * 直接返回 SDK 的 MeResponse（字段可选），组件按需 Pick 自己渲染的字段；
 * 登录态由 auth-kit gate；未登录（guest）不发请求。
 *
 * options/key 直接用生成 SDK 的（纯透传无投影，无需本地包装）。
 */

const meQueryOptions = queryOptions({
    ...sdkMeOptions({}),
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
    return () => queryClient.removeQueries({ queryKey: sdkMeQueryKey({}) })
}
