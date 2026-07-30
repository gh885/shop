import { useSyncExternalStore } from 'react';

import type { TokenStore } from '@shop/api';

const TOKEN_KEY = 'shop_access_token';
const DEVICE_KEY = 'shop_device_id';

const isBrowser = typeof window !== 'undefined';

// ---------- 认证状态（模块级 store，useSyncExternalStore 驱动 UI） ----------

export type AuthStatus = 'unknown' | 'authed' | 'guest';

let accessToken: string | null = isBrowser ? localStorage.getItem(TOKEN_KEY) : null;
// 有残留 token 也不能直接当真（可能已过期），一律先 unknown，待 bootstrap 裁决
let status: AuthStatus = 'unknown';
let loginDialogOpen = false;

const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export const tokenStore: TokenStore & { clear: () => void } = {
    get: () => accessToken,
    set: (token: string) => {
        accessToken = token;
        status = 'authed';
        localStorage.setItem(TOKEN_KEY, token);
        emit();
    },
    clear: () => {
        accessToken = null;
        status = 'guest';
        localStorage.removeItem(TOKEN_KEY);
        emit();
    },
};

export const authState = {
    getStatus: () => status,
    /** bootstrap 失败但无本地态可清时的兜底（不清 localStorage 场景） */
    markGuest: () => {
        status = 'guest';
        emit();
    },
    openLoginDialog: () => {
        loginDialogOpen = true;
        emit();
    },
    closeLoginDialog: () => {
        loginDialogOpen = false;
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

export function useIsLoggedIn(): boolean {
    return useAuthStatus() === 'authed';
}

export function useLoginDialogOpen(): [boolean, (open: boolean) => void] {
    const open = useSyncExternalStore(
        subscribe,
        () => loginDialogOpen,
        () => false,
    );
    const setOpen = (next: boolean) =>
        next ? authState.openLoginDialog() : authState.closeLoginDialog();
    return [open, setOpen];
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
