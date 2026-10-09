import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import {
    getCurrentShopId,
    shopSelectionStore,
    setCurrentShopId,
    syncResolvedShopId,
} from "./shop-store"

/**
 * 当前店铺的两个 getter 是一条容易踩混的界线：
 * `shopSelectionStore.getState()` 是「用户显式选过哪家」（localStorage 里的那份，刷新后还要回到它），
 * `getCurrentShopId` 是「现在这一请求该带哪家」（含 useCurrentShop 落到第一家 ACTIVE 店的兜底）。
 * 兜底值一旦写进 localStorage，用户从没选过店也会被记住一家不该记的。
 */

const STORAGE_KEY = "shop_seller_current_shop"

beforeEach(() => {
    setCurrentShopId(undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    setCurrentShopId(undefined)
})

describe("持久化选择与请求头的分野", () => {
    it("显式切店铺：三处一起动（内存 / 解析值 / localStorage）", () => {
        setCurrentShopId("shop-b")

        expect(shopSelectionStore.getState()).toBe("shop-b")
        expect(getCurrentShopId()).toBe("shop-b")
        expect(localStorage.getItem(STORAGE_KEY)).toBe("shop-b")
    })

    it("解析出的兜底店铺只进请求头那一份，不冒充用户的选择", () => {
        setCurrentShopId(undefined)

        syncResolvedShopId("shop-first-active")

        expect(getCurrentShopId()).toBe("shop-first-active")
        expect(shopSelectionStore.getState()).toBeUndefined()
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it("登出清空：localStorage 里不留上一位卖家的店铺，换账号进来不会带着它", () => {
        setCurrentShopId("shop-a")

        setCurrentShopId(undefined)

        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
        expect(getCurrentShopId()).toBeUndefined()
    })
})

describe("订阅", () => {
    it("切店铺通知订阅者：请求头注入的是解析值，页面不重拉就会拿上一家的数据画在这一家", () => {
        const spy = vi.fn<() => void>()

        const unsubscribe = shopSelectionStore.subscribe(spy)
        setCurrentShopId("shop-c")

        expect(spy).toHaveBeenCalledTimes(1)

        unsubscribe()
        setCurrentShopId("shop-d")

        expect(spy).toHaveBeenCalledTimes(1)
    })
})

describe("store 初始化", () => {
    it("刷新后读回显式选择，初始化不覆盖已有记忆", async () => {
        localStorage.setItem(STORAGE_KEY, "shop-remembered")
        vi.resetModules()
        const fresh = await import("./shop-store")

        expect(fresh.shopSelectionStore.getState()).toBe("shop-remembered")
        expect(fresh.getCurrentShopId()).toBe("shop-remembered")
        expect(localStorage.getItem(STORAGE_KEY)).toBe("shop-remembered")
    })

    it("没有 window 时不读取浏览器持久化数据", async () => {
        localStorage.setItem(STORAGE_KEY, "shop-browser-only")
        vi.stubGlobal("window", undefined)
        vi.resetModules()
        const fresh = await import("./shop-store")

        expect(fresh.shopSelectionStore.getState()).toBeUndefined()
        expect(fresh.getCurrentShopId()).toBeUndefined()
    })
})

it("订阅收到切换时，持久化值与请求头已经同步", () => {
    const snapshots: Array<[string | undefined, string | null]> = []
    const unsubscribe = shopSelectionStore.subscribe(() => {
        snapshots.push([getCurrentShopId(), localStorage.getItem(STORAGE_KEY)])
    })
    try {
        setCurrentShopId("shop-b")
        setCurrentShopId(undefined)
        expect(snapshots).toEqual([
            ["shop-b", "shop-b"],
            [undefined, null],
        ])
    } finally {
        unsubscribe()
    }
})

it("兜底解析不改变显式选择，也不触发组件订阅", () => {
    setCurrentShopId("shop-disabled")
    const listener = vi.fn<() => void>()
    const unsubscribe = shopSelectionStore.subscribe(listener)
    try {
        syncResolvedShopId("shop-first-active")
        expect(shopSelectionStore.getState()).toBe("shop-disabled")
        expect(localStorage.getItem(STORAGE_KEY)).toBe("shop-disabled")
        expect(getCurrentShopId()).toBe("shop-first-active")
        expect(listener).not.toHaveBeenCalled()
    } finally {
        unsubscribe()
    }
})

it("浏览器拒绝清理持久化时仍清空内存，不继续给请求带旧店铺", () => {
    setCurrentShopId("shop-a")
    const error = new Error("Storage unavailable")
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw error
    })
    try {
        expect(() => setCurrentShopId(undefined)).toThrow(error)
        expect(shopSelectionStore.getState()).toBeUndefined()
        expect(getCurrentShopId()).toBeUndefined()
    } finally {
        remove.mockRestore()
    }
})
