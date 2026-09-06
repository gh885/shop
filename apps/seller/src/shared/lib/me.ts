import { useQuery } from "@tanstack/react-query"

import { AuthApi } from "@shop/api/sdk"
import { useAuthStatus } from "./api"

const ME_QUERY_KEY = ["me"] as const
export { ME_QUERY_KEY }

/** 当前登录用户信息（未登录时不发请求） */
export function useMe() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: () => AuthApi.me(),
        enabled: status === "authed",
        staleTime: 5 * 60_000,
        retry: false,
    })
}
