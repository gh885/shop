import type { KyInstance } from "ky"

import {
    ReviewPageSchema,
    ShopReviewSchema,
    StaffInfoSchema,
    type ReviewPage,
    type ShopReview,
    type ShopReviewStatus,
    type StaffInfo,
    type StaffLoginRequest,
} from "./schemas/admin"
import { TokenResultSchema, type TokenResult } from "./schemas/auth"

/**
 * 平台管理端 API（staff 账号体系）。
 * 刷新端点走 admin/auth/refresh（httpOnly cookie），自动续期由 createApiClient 的
 * refreshPath 选项接管；登录态本身走 createAuthKit。
 */
export function createAdminApi(api: KyInstance) {
    return {
        /** 工号 + 密码登录，refresh 由后端落 httpOnly cookie */
        async login(data: StaffLoginRequest): Promise<TokenResult> {
            return TokenResultSchema.parse(
                await api.post("admin/auth/login", { json: data }).json(),
            )
        },

        /** 刷新双 token：cookie 提供 refresh token，body 只带 deviceId */
        async refresh(deviceId: string): Promise<TokenResult> {
            return TokenResultSchema.parse(
                await api.post("admin/auth/refresh", { json: { deviceId } }).json(),
            )
        },

        /** 当前登录员工信息 */
        async me(): Promise<StaffInfo> {
            return StaffInfoSchema.parse(await api.get("admin/auth/me").json())
        },

        /** 登出：清 cookie + 撤销 refresh token */
        async logout(deviceId: string): Promise<void> {
            await api.post("admin/auth/logout", { json: { deviceId } })
        },

        /** 审核队列：按 status 筛选分页 */
        async listReviews(params: {
            status?: ShopReviewStatus
            page: number
            size: number
        }): Promise<ReviewPage> {
            return ReviewPageSchema.parse(
                await api
                    .get("admin/reviews", {
                        searchParams: {
                            ...(params.status ? { status: params.status } : {}),
                            page: params.page,
                            size: params.size,
                        },
                    })
                    .json(),
            )
        },

        /** 审核通过：店铺状态 → ACTIVE */
        async approve(id: string): Promise<ShopReview> {
            return ShopReviewSchema.parse(await api.post(`admin/reviews/${id}/approve`).json())
        },

        /** 审核拒绝：理由必填留痕 */
        async reject(id: string, reason: string): Promise<ShopReview> {
            return ShopReviewSchema.parse(
                await api.post(`admin/reviews/${id}/reject`, { json: { reason } }).json(),
            )
        },
    }
}
