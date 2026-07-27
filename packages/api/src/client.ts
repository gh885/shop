import ky, { HTTPError, type BeforeRequestState, type KyInstance, type Options } from 'ky';
import type { z } from 'zod';

import { ApiErrorSchema, type ApiError } from './schemas/common';

// ---------- Token 存储抽象 ----------

export interface TokenStore {
    get: () => string | null;
    set: (token: string) => void;
}

// ---------- 可观测性 ----------

const startTimes = new WeakMap<Request, number>();

// ---------- API Client ----------

export interface ApiClient {
    /** 原始 ky 实例（底层访问用） */
    raw: KyInstance;
    /** 带 Zod 校验的请求函数 */
    request: <T>(schema: z.ZodType<T>, path: string, options?: Options) => Promise<T>;
}

/**
 * 创建 API 客户端实例
 *
 * @param baseUrl - 后端基础 URL（浏览器端用空串走 Vite proxy，SSR 端传后端地址）
 * @param tokens  - Token 存储（传了后自动注入 Authorization header + 401 自动 refresh）
 */
export function createApiClient(baseUrl: string, tokens?: TokenStore): ApiClient {
    const raw: KyInstance = ky.create({
        prefix: baseUrl,
        credentials: 'include',

        // 请求超时 10s
        timeout: 10_000,

        // 网络抖动 / 5xx 自动重试（仅 GET）
        retry: {
            limit: 2,
            methods: ['get'],
            statusCodes: [408, 429, 502, 503, 504],
        },

        hooks: {
            // ---- 请求前：注入 token + 全链路 ID + 计时起点 ----
            beforeRequest: [
                (state: BeforeRequestState) => {
                    // 认证
                    if (tokens) {
                        const token = tokens.get();
                        if (token) {
                            state.request.headers.set('Authorization', `Bearer ${token}`);
                        }
                    }

                    // 全链路 Correlation ID（重试时复用已生成的）
                    if (!state.request.headers.has('X-Correlation-Id')) {
                        state.request.headers.set('X-Correlation-Id', crypto.randomUUID());
                    }

                    // 计时
                    startTimes.set(state.request, performance.now());
                },
            ],

            // ---- 重试前：确保 token 是最新的（auto-refresh 场景） ----
            beforeRetry: [
                ({ request: req }) => {
                    if (tokens) {
                        const token = tokens.get();
                        if (token) {
                            req.headers.set('Authorization', `Bearer ${token}`);
                        }
                    }
                },
            ],

            // ---- 响应后：日志 + 401 自动 refresh ----
            afterResponse: [
                async ({ request: req, response }) => {
                    const path = new URL(req.url).pathname;
                    const start = startTimes.get(req);
                    const ms = start ? Math.round(performance.now() - start) : 0;

                    // 日志
                    console.log(
                        `[API] ${req.method} ${path} ${response.status} ${ms}ms`,
                        response.ok ? '' : response.statusText,
                    );

                    // 401 自动刷新（跳过 refresh 端点本身，防止死循环）
                    if (response.status === 401 && path !== '/auth/refresh' && tokens) {
                        try {
                            const res = (await raw('auth/refresh', {
                                method: 'POST',
                            }).json()) as { accessToken: string };

                            tokens.set(res.accessToken);

                            // 强制重试原始请求
                            return ky.retry();
                        } catch {
                            // refresh 失败 → 原始 401 正常冒泡
                        }
                    }
                },
            ],
        },
    });

    async function request<T>(schema: z.ZodType<T>, path: string, options?: Options): Promise<T> {
        try {
            const data = (await raw(path, options).json()) as unknown;
            return schema.parse(data);
        } catch (error) {
            throw normalizeError(error);
        }
    }

    return { raw, request };
}

// ---------- 错误归一化 ----------

function normalizeError(error: unknown): ApiError {
    if (error instanceof HTTPError) {
        if (error.data && typeof error.data === 'object') {
            const result = ApiErrorSchema.safeParse(error.data);
            if (result.success) return result.data;
        }
        return {
            status: error.response.status,
            detail: error.message,
        };
    }

    if (error instanceof TypeError) {
        return { status: 0, detail: '网络错误，请检查连接' };
    }

    throw error;
}
