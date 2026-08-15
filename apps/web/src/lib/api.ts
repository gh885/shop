import { useEffect } from 'react';
import { redirect, useNavigate } from '@tanstack/react-router';

import { createApiClient, createAuthApi, createShopApi } from '@shop/api';
import type { ApiError } from '@shop/api';

import { authState, getDeviceId, tokenStore } from './auth';

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const api = createApiClient('', tokenStore);
export const authApi = createAuthApi(api.raw);
export const shopApi = createShopApi(api.raw);

// ---------- 登录态引导 ----------

let bootstrapPromise: Promise<void> | null = null;

/**
 * 启动时静默刷新：refresh cookie 有效则换新 access token，否则按未登录处理。
 * 去重为单例 Promise，可在多处安全 await（root 挂载、路由守卫）。
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

/**
 * 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录则拉起登录 Dialog 并跳回首页。
 *
 * SSR 首屏无法裁决登录态（refresh cookie 只在浏览器端刷新），直接放行，由页面的 useAuthGuard 兜底。
 *
 * 用法：createFileRoute('/x')({ beforeLoad: () => requireAuth(), ... })
 */
export async function requireAuth(): Promise<void> {
    if (import.meta.env.SSR) return;
    await bootstrapAuth();
    if (authState.getStatus() !== 'authed') {
        authState.openLoginDialog();
        throw redirect({ to: '/' });
    }
}

/**
 * SSR 直访受保护页的客户端兜底守卫：挂载后裁决登录态，未登录拉起登录 Dialog 并跳回首页。
 * 与 beforeLoad 的 requireAuth 配合（客户端导航走 beforeLoad，SSR 直访走这里）。
 */
export function useAuthGuard(): void {
    const navigate = useNavigate();
    useEffect(() => {
        void bootstrapAuth().then(() => {
            if (authState.getStatus() !== 'authed') {
                authState.openLoginDialog();
                void navigate({ to: '/' });
            }
        });
    }, [navigate]);
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

/**
 * 把 authApi 抛出的 ky HTTPError 归一化为 ApiError（读取 RFC7807 错误体）
 */
export async function toApiError(error: unknown): Promise<ApiError> {
    if (isHttpErrorLike(error)) {
        // ky v2 已预解析 body 到 error.data（response.body 此时已被消耗，不能再 .json()）
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
