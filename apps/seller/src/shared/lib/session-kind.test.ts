import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
    clearSessionKind,
    getSessionKind,
    isSubaccountSession,
    setSessionKind,
    subscribeSessionKind,
} from "./session-kind"

const STORAGE_KEY = "shop_seller_session_kind"

afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
})

/**
 * 会话种类的钉子。它决定三件看不到的事（刷哪个端点、注不注 X-Shop-Id、能不能打 /shops/mine），
 * 而**默认值**是其中最容易被改坏的一格：默认成 subaccount 会让每个还没登录的浏览器都拿错刷新端点。
 */
describe("卖家端会话种类", () => {
    it("没有记录时默认 owner", () => {
        expect(getSessionKind()).toBe("owner")
        expect(isSubaccountSession()).toBe(false)
    })

    it("写入后读得到，清掉后回到 owner", () => {
        setSessionKind("subaccount")
        expect(localStorage.getItem(STORAGE_KEY)).toBe("subaccount")
        expect(isSubaccountSession()).toBe(true)

        clearSessionKind()
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
        expect(getSessionKind()).toBe("owner")
    })

    it("只认 subaccount 这一个值：别的脏值一律当 owner", () => {
        localStorage.setItem(STORAGE_KEY, "admin")
        expect(getSessionKind()).toBe("owner")
    })

    it("变化会通知订阅者（守卫与账号区靠它重渲染）", () => {
        const listener = vi.fn<() => void>()
        const unsubscribe = subscribeSessionKind(listener)

        setSessionKind("subaccount")
        expect(listener).toHaveBeenCalledTimes(1)
        clearSessionKind()
        expect(listener).toHaveBeenCalledTimes(2)

        unsubscribe()
        setSessionKind("subaccount")
        expect(listener).toHaveBeenCalledTimes(2)
    })
})
