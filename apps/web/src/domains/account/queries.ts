import { queryOptions } from "@tanstack/react-query"

import { AccountDeletionApi, AuthApi, type MeResponse } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit/data"
import { useAuthStatus } from "#/shared/api/auth"

const me = createMeQuery<MeResponse | undefined>({
    scope: "me",
    queryFn: () => AuthApi.me(),
    useAuthStatus,
    userIdOf: (value) => value?.id,
})

/** 当前用户缓存 key（登录/登出/资料更新的失效入口，profile 页也引用它） */
export const { ME_QUERY_KEY } = me

/** 当前登录用户信息（未登录时不发请求） */
export const useMe = me.useMe

/** 登出等场景下清除缓存的用户信息 */
export const useClearMe = me.useClearMe

/** 设备列表 key 工厂：all 是失效入口（前缀匹配），list 额外带当前设备 id */
export const deviceKeys = {
    all: ["devices"] as const,
    list: (currentDeviceId: string) => [...deviceKeys.all, currentDeviceId] as const,
}

/**
 * 登录设备列表：`currentDeviceId` 必须进 key —— 后端据它给「本机」打标，
 * 不入 key 的话换设备（同浏览器换账号/清了 localStorage）会读到上一台机器的 isCurrent。
 */
export const devicesOptions = (currentDeviceId: string) =>
    queryOptions({
        queryKey: deviceKeys.list(currentDeviceId),
        queryFn: () => AuthApi.devices({ query: { currentDeviceId } }),
    })

/**
 * 注销状态只有一条 key（后端按 token 认人，没有参数），所以 `all` 就是本体：
 * 提交申请与撤销都从前缀失效它。
 */
export const deletionKeys = {
    all: ["account-deletion"] as const,
}

/** 注销状态：有没有待生效的申请、哪一刻生效。 */
export const deletionStatusOptions = () =>
    queryOptions({
        queryKey: deletionKeys.all,
        queryFn: () => AccountDeletionApi.deletionStatus(),
    })
