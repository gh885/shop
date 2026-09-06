import { queryOptions } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/api"
import { AdminAuthApi, AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewListItemResponse, ShopReviewStatus } from "@shop/api/sdk"

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

    /** 店铺审核分页列表（wire 透传，无字段变换——形状单一来源是 SDK 的 ShopReviewListItemResponse） */
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
export type ShopReviewItem = ShopReviewListItemResponse

// ---------- 路由守卫 ----------

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

// ---------- queryOptions：参数化列表的 key/请求同源（与 seller 的 productListOptions 同形态） ----------

/** 审核列表失效 key（mutation 后一发命中所有 status/分页） */
export const REVIEW_LIST_KEY = ["admin", "reviews"] as const

export const reviewListOptions = (input: {
    status?: ShopReviewStatus
    page: number
    size: number
}) =>
    queryOptions({
        queryKey: [...REVIEW_LIST_KEY, input.status ?? "all", input.page, input.size] as const,
        queryFn: () => adminApi.listReviews(input),
        // 服务端分页/筛选时保留上一份数据，避免每次翻页都闪整表加载态
        placeholderData: (prev) => prev,
    })
