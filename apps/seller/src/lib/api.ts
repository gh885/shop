import { redirect } from '@tanstack/react-router';

import { createApiClient, createAuthApi, createProductApi, createShopApi } from '@shop/api';
import type { ApiError } from '@shop/api';

import { authState, getDeviceId, tokenStore } from './auth';

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const api = createApiClient('', tokenStore);
export const authApi = createAuthApi(api.raw);
export const shopApi = createShopApi(api.raw);
export const productApi = createProductApi(api.raw);

// ---------- 登录态引导 ----------

let bootstrapPromise: Promise<void> | null = null;

/**
 * 启动时静默刷新：refresh cookie 有效则换新 access token，否则按未登录处理。
 * 去重为单例 Promise，可在多处安全 await（路由守卫、登录页）。
 */
export function bootstrapAuth(): Promise<void> {
    bootstrapPromise ??= authApi
        .refresh({ deviceId: getDeviceId() })
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

// ---------- 登出 ----------

export async function logout(): Promise<void> {
    try {
        await authApi.logout({ deviceId: getDeviceId() });
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear();
    }
}

// ---------- 路由守卫 ----------

/** 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth();
    if (authState.getStatus() !== 'authed') {
        throw redirect({ to: '/login' });
    }
}

// ---------- 错误归一化 ----------

interface HttpErrorLike {
    response: Response;
    /** ky v2 预解析的错误响应体（JSON 自动 parse，此时 response.body 已消耗） */
    data?: unknown;
}

function isHttpErrorLike(error: unknown): error is HttpErrorLike {
    return (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        (error as HttpErrorLike).response instanceof Response
    );
}

/** 把 ky HTTPError 归一化为 ApiError（读取 RFC7807 错误体） */
export async function toApiError(error: unknown): Promise<ApiError> {
    if (isHttpErrorLike(error)) {
        const body = error.data as Partial<ApiError> | undefined;
        if (body && typeof body.detail === 'string') {
            return {
                status: error.response.status,
                detail: body.detail,
                code: body.code,
                requestId: body.requestId,
            };
        }
        return { status: error.response.status, detail: '请求失败，请稍后重试' };
    }
    return { status: 0, detail: '网络错误，请检查连接' };
}
