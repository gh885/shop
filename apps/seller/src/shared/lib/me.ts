import { AuthApi, type MeResponse } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit"

import { useAuthStatus } from "./api"

/**
 * 「当前登录用户」查询的 seller 接线：本文件只有装配参数 ——
 * 请求方法（AuthApi.me）与本端 authKit 的登录态 hook。
 */

const me = createMeQuery<MeResponse | undefined>({
    scope: "me",
    queryFn: () => AuthApi.me(),
    useAuthStatus,
})

/** 当前登录用户信息（未登录时不发请求） */
export const useMe = me.useMe

/** 登出时清除用户信息缓存（removeQueries 走工厂自带的 key，端里不复制 ME_QUERY_KEY） */
export const useClearMe = me.useClearMe
