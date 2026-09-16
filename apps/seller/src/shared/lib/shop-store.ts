/**
 * 当前店铺 id 的纯存储（localStorage 持久化 + 已解析值缓存）。
 * 独立成文件是为了让 api.ts（SDK 装配）能引用它而不与 shop.ts 形成依赖环：
 * shop.ts → api.ts（useAuthStatus），api.ts → 本文件（contextHeaders 注入 X-Shop-Id）。
 */

const STORAGE_KEY = "shop_seller_current_shop"

// 统一 undefined 约定：localStorage.getItem 返回 string | null，此处归一为 string | undefined
// SSR/测试环境（typeof window === "undefined"）下不读 localStorage，回落 undefined
let stored: string | undefined =
    typeof window === "undefined" ? undefined : (localStorage.getItem(STORAGE_KEY) ?? undefined)

/**
 * 已解析的当前店铺 id（useCurrentShop 的解析结果，含「落到第一家 ACTIVE 店」兜底）。
 * 供 SDK client 请求拦截注入 X-Shop-Id —— 业务代码不再手动携带店铺头。
 */
let resolved: string | undefined = stored

const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function setCurrentShopId(shopId: string | undefined) {
    stored = shopId
    resolved = shopId
    if (shopId) {
        localStorage.setItem(STORAGE_KEY, shopId)
    } else {
        localStorage.removeItem(STORAGE_KEY)
    }
    listeners.forEach((l) => l())
}

export function getStoredShopId() {
    return stored
}

/** 当前店铺 id 的非 React 读取口（SDK client contextHeaders 用） */
export function getCurrentShopId() {
    return resolved
}

/** useCurrentShop 每次解析后同步（幂等赋值，非 React 状态） */
export function syncResolvedShopId(shopId: string | undefined) {
    resolved = shopId
}
