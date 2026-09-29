import { queryOptions } from "@tanstack/react-query"

import { AccountDeletionApi, AuthApi, type MeResponse } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit"

import { useAuthStatus } from "#/shared/api/auth"

/**
 * account/queries —— 当前登录用户的 React 接线层。这里只管读写。
 * 直接返回 SDK 的 MeResponse（字段可选），组件按需 Pick 自己渲染的字段；
 * 登录态由 auth-kit gate；未登录（guest）不发请求。
 *
 * 查询本体（key / 新鲜度 / enabled 条件）在 @shop/app-kit 的 createMeQuery ——
 * 与 seller/admin 的 me 查询同源，本文件只剩两端装配参数：请求方法 + 本端 authKit 的登录态。
 */

const me = createMeQuery<MeResponse | undefined>({
    scope: "me",
    queryFn: () => AuthApi.me(),
    useAuthStatus,
    // 监控事件信封的 userId（契约第 1 条）；登出时 me 变 undefined 自动清空
    userIdOf: (value) => value?.id,
})

/** 当前用户缓存 key（登录/登出/资料更新的失效入口，profile 页也引用它） */
export const { ME_QUERY_KEY } = me

/** 当前登录用户信息（未登录时不发请求） */
export const useMe = me.useMe

/** 登出等场景下清除缓存的用户信息 */
export const useClearMe = me.useClearMe

// 登录设备（安全设置页）
/** 设备列表 key 工厂：all 是失效入口（前缀匹配），list 额外带当前设备 id */
export const deviceKeys = {
    all: ["devices"] as const,
    list: (currentDeviceId: string) => ["devices", currentDeviceId] as const,
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

// 账号注销（安全设置页底部那张卡）
/**
 * 注销状态只有一条 key（后端按 token 认人，没有参数），所以 `all` 就是本体：
 * 提交申请与撤销都从前缀失效它。
 */
export const deletionKeys = {
    all: ["account-deletion"] as const,
}

/**
 * 注销状态：有没有待生效的申请、哪一刻生效。
 * 不进 loader 预取——它是页尾的销毁性入口，为一个可能一辈子不点的东西挡首屏不值。
 */
export const deletionStatusOptions = () =>
    queryOptions({
        queryKey: deletionKeys.all,
        queryFn: () => AccountDeletionApi.deletionStatus(),
    })
