import { createApiClient } from '@shop/api';
import { redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { authState, getDeviceId, tokenStore } from './auth';

// admin 专属 API 客户端：staff 账号体系与 C 端隔离，刷新端点走 admin/auth/refresh（cookie）
export const api = createApiClient('', tokenStore, { refreshPath: 'admin/auth/refresh' });

// ---------- Schemas（与后端契约一致） ----------

export const StaffLoginRequestSchema = z.object({
    employeeNo: z.string().min(1).max(50).trim(),
    password: z.string().min(8).max(72),
    deviceId: z.string().min(1).max(100),
});
export type StaffLoginRequest = z.infer<typeof StaffLoginRequestSchema>;

export const TokenResultSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
});
export type TokenResult = z.infer<typeof TokenResultSchema>;

export const StaffInfoSchema = z.object({
    id: z.string(),
    employeeNo: z.string(),
    displayName: z.string(),
});
export type StaffInfo = z.infer<typeof StaffInfoSchema>;

export const ShopReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type ShopReviewStatus = z.infer<typeof ShopReviewStatusSchema>;

export const ShopReviewItemSchema = z.object({
    id: z.string(),
    shopId: z.string(),
    shopName: z.string(),
    ownerPhone: z.string(),
    status: ShopReviewStatusSchema,
    reason: z.string().nullable(),
    decidedAt: z.string().nullable(),
    createdAt: z.string(),
});
export type ShopReviewItem = z.infer<typeof ShopReviewItemSchema>;

export const ShopReviewSchema = z.object({
    id: z.string(),
    shopId: z.string(),
    staffId: z.string().nullable(),
    status: ShopReviewStatusSchema,
    reason: z.string().nullable(),
    decidedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const ReviewPageSchema = z.object({
    records: z.array(ShopReviewItemSchema),
    total: z.number(),
    size: z.number(),
    current: z.number(),
    pages: z.number(),
});
export type ReviewPage = z.infer<typeof ReviewPageSchema>;

// ---------- 端点 ----------

export const adminApi = {
    /** 工号 + 密码登录，refresh 由后端落 httpOnly cookie */
    login(data: StaffLoginRequest): Promise<TokenResult> {
        return api.request(TokenResultSchema, 'admin/auth/login', {
            method: 'POST',
            json: data,
        });
    },

    /** 刷新双 token：cookie 提供 refresh token，body 只带 deviceId */
    refresh(deviceId: string): Promise<TokenResult> {
        return api.request(TokenResultSchema, 'admin/auth/refresh', {
            method: 'POST',
            json: { deviceId },
        });
    },

    /** 当前登录员工信息 */
    me(): Promise<StaffInfo> {
        return api.request(StaffInfoSchema, 'admin/auth/me');
    },

    /** 登出：清 cookie + 撤销 refresh token */
    logout(deviceId: string): Promise<void> {
        return api.raw.post('admin/auth/logout', { json: { deviceId } }).then(() => {});
    },

    /** 审核队列：按 status 筛选分页 */
    listReviews(params: {
        status?: ShopReviewStatus;
        page: number;
        size: number;
    }): Promise<ReviewPage> {
        const search = new URLSearchParams();
        if (params.status) search.set('status', params.status);
        search.set('page', String(params.page));
        search.set('size', String(params.size));
        return api.request(ReviewPageSchema, `admin/reviews?${search}`);
    },

    /** 审核通过：店铺状态 → ACTIVE */
    approve(id: string) {
        return api.request(ShopReviewSchema, `admin/reviews/${id}/approve`, { method: 'POST' });
    },

    /** 审核拒绝：理由必填留痕 */
    reject(id: string, reason: string) {
        return api.request(ShopReviewSchema, `admin/reviews/${id}/reject`, {
            method: 'POST',
            json: { reason },
        });
    },
};

// ---------- 登录态引导 ----------

let bootstrapPromise: Promise<void> | null = null;

/**
 * 启动时静默刷新：refresh cookie 有效则换新 access token，否则按未登录处理。
 * 去重为单例 Promise，可在多处安全 await（root 挂载、路由守卫）。
 */
export function bootstrapAuth(): Promise<void> {
    bootstrapPromise ??= adminApi
        .refresh(getDeviceId())
        .then((result) => {
            tokenStore.set(result.accessToken);
        })
        .catch(() => {
            tokenStore.clear();
        })
        .finally(() => {
            if (authState.getStatus() === 'unknown') authState.markGuest();
        });
    return bootstrapPromise;
}

// ---------- 路由守卫 ----------

/** 受保护路由：未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth();
    if (authState.getStatus() !== 'authed') {
        throw redirect({ to: '/login' });
    }
}

/** 登录页专用：已登录跳回工作台 */
export async function requireGuest(): Promise<void> {
    await bootstrapAuth();
    if (authState.getStatus() === 'authed') {
        throw redirect({ to: '/', search: { page: 1, size: 20 } });
    }
}
