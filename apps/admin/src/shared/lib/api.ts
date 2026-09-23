import { queryOptions } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/common"
import { AdminAuthApi, AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewStatus } from "@shop/api/sdk"

import { reviewKeys } from "./queries"

// admin 专属装配：staff 账号体系与 C 端隔离，刷新端点走 /admin/auth/refresh（cookie）。
// 生成 SDK（@shop/api/sdk）统一出入参，业务方法经 adminApi 具名封装（error 转抛供调用方 catch）。
const authKit = createAuthKit({
    deviceKey: "shop_admin_device_id",
    // 引用下方 AdminAuthApi：调用发生在模块初始化后，安全
    // SDK 出错即 throw（responseStyle: data + throwOnError），失败由 createAuthKit 裁决为 guest
    refresh: async () => {
        const res = await AdminAuthApi.refreshStaffSession()
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})
export const { tokenStore, getDeviceId, useAuthStatus } = authKit
const { authState, bootstrapAuth } = authKit

// 生成 SDK 的默认 client：同源 + 同一套 token / 401 刷新拦截（刷新端点 admin 侧不同）
configureSdkClient("", tokenStore, {
    refreshPath: "admin/auth/refresh",
    debug: import.meta.env.DEV,
})

/** admin 业务方法封装：SDK 出错即 throw（throwOnError），供调用方统一 catch 归一化 */
export const adminApi = {
    /** 员工登录：成功后返回 access token */
    async login(input: { employeeNo: string; password: string; deviceId: string }) {
        const data = await AdminAuthApi.staffLogin({ body: input })
        return { accessToken: data.accessToken }
    },

    /** 店铺审核分页列表（wire 透传，无字段变换——形状单一来源是 SDK 的 ShopReviewItem，联系电话是掩码） */
    async listReviews(input: { status?: ShopReviewStatus; page: number; size: number }) {
        const page = await AdminReviewsApi.listShopReviews({
            query: {
                status: input.status,
                pageParams: { page: input.page, size: input.size },
            },
        })
        return {
            records: page.records,
            total: page.total,
        }
    },

    /** 查看某一条申请的店主电话明文：列表只给掩码，明文逐条索取且后端留痕（ACC-79） */
    async revealOwnerPhone(id: string) {
        const res = await AdminReviewsApi.revealOwnerPhone({ path: { id } })
        return res.phone
    },

    /** 审核通过 */
    async approve(id: string) {
        await AdminReviewsApi.approveShopReview({ path: { id } })
    },

    /** 审核驳回 */
    async reject(id: string, reason: string) {
        await AdminReviewsApi.rejectShopReview({ path: { id }, body: { reason } })
    },
}

/** 店铺审核行：直接复用生成契约（reason/decidedAt 契约可空 = PENDING 时无值，UI 显示「—」） */
export type { ShopReviewItem } from "@shop/api/sdk"

// 路由守卫
/** 受保护路由：未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}

/** 登录页专用：已登录跳回工作台 */
export async function requireGuest(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() === "authed") {
        throw redirect({ to: "/", search: { page: 1, size: 20 } })
    }
}

// queryOptions：参数化列表的 key/请求同源// key 不在这里定义：全部集中在 key 工厂（失效关系的唯一入口）

export const reviewListOptions = (input: {
    status?: ShopReviewStatus
    page: number
    size: number
}) =>
    queryOptions({
        queryKey: reviewKeys.list(input),
        queryFn: () => adminApi.listReviews(input),
        // 服务端分页/筛选时保留上一份数据，避免每次翻页都闪整表加载态
        placeholderData: (prev) => prev,
        // 带 placeholderData（不能走 suspense），失败冒到路由错误页（全局默认的官方判据：
        // 只在「一条数据都没有」时抛，翻页失败不会把已有表格换掉）
    })
