import { AdminAuthApi } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit/data"
import { useAuthStatus } from "./api"

const me = createMeQuery({
    scope: "admin/me",
    queryFn: () => AdminAuthApi.getStaffMe(),
    useAuthStatus,
    userIdOf: (value) => value.id,
})

export const useMe = me.useMe

export const useClearMe = me.useClearMe

export const ME_QUERY_KEY = me.ME_QUERY_KEY
