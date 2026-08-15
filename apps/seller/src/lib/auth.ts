import { useSyncExternalStore } from 'react';

import type { TokenStore } from '@shop/api';

// access token 只存内存：短效（10 分钟），页面加载由 bootstrap 用 refresh cookie 换新
const DEVICE_KEY = 'shop_device_id';

// ---------- 认证状态（模块级 store，useSyncExternalStore 驱动 UI） ----------

export type AuthStatus = 'unknown' | 'authed' | 'guest';

// 启动时一律 unknown，待 bootstrap 用 refresh cookie 换新 access token 后裁决
let accessToken: string | null = null;
let status: AuthStatus = 'unknown';

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export const tokenStore: TokenStore & { clear: () => void } = {
    get: () => accessToken,
    set: (token: string) => {
        accessToken = token;
        status = 'authed';
        emit();
    },
    clear: () => {
        accessToken = null;
        status = 'guest';
        emit();
    },
};

export const authState = {
    getStatus: () => status,
    /** bootstrap 失败但无本地态可清时的兜底 */
    markGuest: () => {
        status = 'guest';
        emit();
    },
};

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useAuthStatus(): AuthStatus {
    return useSyncExternalStore(subscribe, authState.getStatus, () => 'unknown');
}

// ---------- 设备 ID（持久化，用于多端会话管理） ----------

let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
    if (cachedDeviceId) return cachedDeviceId;
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) {
        cachedDeviceId = stored;
        return stored;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    cachedDeviceId = id;
    return id;
}
