import { useQuery } from "@tanstack/react-query"

import { adminApi } from "./api"
import { useAuthStatus } from "./api"

const ME_QUERY_KEY = ["admin", "me"] as const

/** 当前登录员工信息（未登录时不发请求）；Account 头像与侧栏账号共用同一份缓存 */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: () => adminApi.me(),
        enabled: status === "authed",
        staleTime: 5 * 60_000,
        retry: false,
    })
}
