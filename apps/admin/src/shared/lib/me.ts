import { AdminAuthApi } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit"

import { useAuthStatus } from "./api"

/**
 * 「当前登录员工」查询的 admin 接线：本文件只有装配参数 ——
 * 请求方法（AdminAuthApi.getStaffMe）与本端 authKit 的登录态 hook。
 *
 * scope 保留 "admin/me"：与后端端点 /admin/auth/me 一一对应，与其他端的 me 不同源。
 */

const me = createMeQuery({
    scope: "admin/me",
    queryFn: () => AdminAuthApi.getStaffMe(),
    useAuthStatus,
})

/** 当前员工缓存 key（登出等场景的失效入口） */
export const ME_QUERY_KEY = me.ME_QUERY_KEY

/** 当前登录员工信息（未登录时不发请求）；Account 头像与侧栏账号共用同一份缓存 */
export const useMe = me.useMe
