import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit, unwrap } from "@shop/api"
import { AdminAuthApi, AdminReviewsApi } from "@shop/api/sdk"

// admin 专属装配：staff 账号体系与 C 端隔离，刷新端点走 /admin/auth/refresh（cookie）。
// 生成 SDK（@shop/api/sdk）统一出入参，业务方法经 adminApi 具名封装（error 转抛供调用方 catch）。
export const authKit = createAuthKit({
    deviceKey: "shop_admin_device_id",
    // 引用下方 AdminAuthApi：调用发生在模块初始化后，安全
    refresh: async () => {
        const res = await AdminAuthApi.refreshStaffSession()
        const token = res.data?.accessToken
        if (!token) throw res.error ?? new Error("refresh 失败")
        return { accessToken: token }
    },
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus } = authKit

// 生成 SDK 的默认 client：同源 + 同一套 token / 401 刷新拦截（刷新端点 admin 侧不同）
configureSdkClient("", tokenStore, {
    refreshPath: "admin/auth/refresh",
    debug: import.meta.env.DEV,
})

/** admin 业务方法封装：SDK 返回 { data, error } 不抛错，unwrap 把 error 转抛，供调用方统一 catch 归一化 */
export const adminApi = {
    /** 员工登录：成功后返回 access token */
    async login(input: { employeeNo: string; password: string; deviceId: string }) {
        const data = unwrap(await AdminAuthApi.staffLogin({ body: input }))
        return { accessToken: data.accessToken ?? "" }
    },

    /** 当前登录员工信息 */
    async me() {
        return unwrap(await AdminAuthApi.getStaffMe())
    },

    /** 登出 */
    async logout(deviceId: string) {
        unwrap(await AdminAuthApi.staffLogout({ body: { deviceId } }))
    },

    /** 店铺审核分页列表 */
    async listReviews(input: { status?: string; page: number; size: number }) {
        const page = unwrap(
            await AdminReviewsApi.listShopReviews({
                query: {
                    status: input.status,
                    pageParams: { page: input.page, size: input.size },
                },
            }),
        )
        return {
            records: (page.records ?? []).map((r) => ({
                id: r.id ?? "",
                shopId: r.shopId ?? "",
                shopName: r.shopName ?? "",
                ownerPhone: r.ownerPhone ?? "",
                status: r.status ?? "",
                reason: r.reason ?? "",
                decidedAt: r.decidedAt ?? "",
                createdAt: r.createdAt ?? "",
            })),
            total: page.total ?? 0,
        }
    },

    /** 审核通过 */
    async approve(id: string) {
        unwrap(await AdminReviewsApi.approveShopReview({ path: { id } }))
    },

    /** 审核驳回 */
    async reject(id: string, reason: string) {
        unwrap(await AdminReviewsApi.rejectShopReview({ path: { id }, body: { reason } }))
    },
}

/** 店铺审核行：wire 字段归一（后端非空返回，此处定非可选形状供表格使用） */
export type ShopReviewItem = {
    id: string
    shopId: string
    shopName: string
    ownerPhone: string
    status: string
    reason: string
    decidedAt: string
    createdAt: string
}

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
