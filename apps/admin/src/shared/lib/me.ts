import { queryOptions, useQuery } from "@tanstack/react-query"

import { AdminAuthApi } from "@shop/api/sdk"

import { useAuthStatus } from "./api"

const ME_QUERY_KEY = ["admin", "me"] as const

const meQueryOptions = queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: () => AdminAuthApi.getStaffMe(),
    staleTime: 5 * 60_000,
    retry: false,
})

/** 当前登录员工信息（未登录时不发请求）；Account 头像与侧栏账号共用同一份缓存 */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({ ...meQueryOptions, enabled: status === "authed" })
}
