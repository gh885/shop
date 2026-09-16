import { AuthApi, type MeResponse } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit"

import { useAuthStatus } from "./api"

/**
 * 「当前登录用户」查询的 seller 接线：查询本体（key / 新鲜度 / enabled 条件）
 * 在 @shop/app-kit 的 createMeQuery，与 web/admin 同源；本文件只有两端装配参数 ——
 * 请求方法（AuthApi.me）与本端 authKit 的登录态 hook。
 */

const me = createMeQuery<MeResponse | undefined>({
    scope: "me",
    queryFn: () => AuthApi.me(),
    useAuthStatus,
})

/** 当前用户缓存 key（登录/登出场景的失效入口） */
export const ME_QUERY_KEY = me.ME_QUERY_KEY

/** 当前登录用户信息（未登录时不发请求） */
export const useMe = me.useMe
