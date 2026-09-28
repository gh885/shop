import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import {
    getCurrentShopId,
    getStoredShopId,
    setCurrentShopId,
    subscribe,
    syncResolvedShopId,
} from "./shop-store"

/**
 * 当前店铺的两个 getter 是一条容易踩混的界线：
 * `getStoredShopId` 是「用户显式选过哪家」（localStorage 里的那份，刷新后还要回到它），
 * `getCurrentShopId` 是「现在这一请求该带哪家」（含 useCurrentShop 落到第一家 ACTIVE 店的兜底）。
 * 兜底值一旦写进 localStorage，用户从没选过店也会被记住一家不该记的。
 */

const STORAGE_KEY = "shop_seller_current_shop"

beforeEach(() => {
    setCurrentShopId(undefined)
})

describe("两个 getter 的分野", () => {
    it("显式切店铺：三处一起动（内存 / 解析值 / localStorage）", () => {
        setCurrentShopId("shop-b")

        expect(getStoredShopId()).toBe("shop-b")
        expect(getCurrentShopId()).toBe("shop-b")
        expect(localStorage.getItem(STORAGE_KEY)).toBe("shop-b")
    })

    it("解析出的兜底店铺只进请求头那一份，不冒充用户的选择", () => {
        setCurrentShopId(undefined)

        syncResolvedShopId("shop-first-active")

        expect(getCurrentShopId()).toBe("shop-first-active")
        expect(getStoredShopId()).toBeUndefined()
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

        const unsubscribe = subscribe(spy)
        setCurrentShopId("shop-c")

        expect(spy).toHaveBeenCalledTimes(1)

        unsubscribe()
        setCurrentShopId("shop-d")

        expect(spy).toHaveBeenCalledTimes(1)
    })
})
