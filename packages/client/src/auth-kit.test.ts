import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { createAuthKit } from "./auth-kit"

/**
 * 钉住两件事：三态怎么裁决（unknown 只能被一次写入或一轮刷新终结，卡住就是守卫永远放行/永远拦），
 * 以及刷新的去重与作废（root 挂载、路由守卫、登录页都 await——各发一次就是多次 refresh 轮换、第二次起全被判重放；登出后缓存必须作废，否则「guest」永远生效）。
 * useAuthStatus / useIsLoggedIn 是 useSyncExternalStore 直连转发；本包 node 环境不带渲染器，订阅链路交给 app-kit 组件测试（基建只测一次）。
 */

interface MemoryStorage {
    data: Map<string, string>
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
}

let storage: MemoryStorage

type Refresh = (deviceId: string) => Promise<{ accessToken: string }>

function makeKit(refresh: Refresh = async () => ({ accessToken: "at-new" })) {
    const spy = vi.fn<(deviceId: string) => Promise<{ accessToken: string }>>(refresh)
    return { kit: createAuthKit({ refresh: spy }), refresh: spy }
}

beforeEach(() => {
    storage = {
        data: new Map(),
        getItem: (key) => storage.data.get(key) ?? null,
        setItem: (key, value) => void storage.data.set(key, value),
    }
    vi.stubGlobal("localStorage", storage)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("登录态裁决", () => {
    it("启动时是 unknown：还没拿 refresh cookie 换过 token，不能假装知道用户是谁", () => {
        expect(makeKit().kit.authState.getStatus()).toBe("unknown")
    })

    it("写入 access token 即裁决为 authed：登录成功不该再等一轮刷新才生效", () => {
        const { kit } = makeKit()

        kit.tokenStore.set("at-1")

        expect(kit.authState.getStatus()).toBe("authed")
        expect(kit.tokenStore.get()).toBe("at-1")
    })

    it("清除即 guest 而不是退回 unknown：登出后要能立刻判出「没登录」", () => {
        const { kit } = makeKit()
        kit.tokenStore.set("at-1")

        kit.tokenStore.clear()

        expect(kit.authState.getStatus()).toBe("guest")
        expect(kit.tokenStore.get()).toBeNull()
    })
})

describe("bootstrapAuth", () => {
    it("刷新成功：换上来的 token 就是后续请求的凭据", async () => {
        const { kit } = makeKit(async () => ({ accessToken: "at-from-cookie" }))

        await kit.bootstrapAuth()

        expect(kit.tokenStore.get()).toBe("at-from-cookie")
        expect(kit.authState.getStatus()).toBe("authed")
    })

    it("刷新失败按未登录处理：cookie 过期是常态，不是错误", async () => {
        const { kit } = makeKit(async () => {
            throw new Error("401")
        })

        await kit.bootstrapAuth()

        expect(kit.authState.getStatus()).toBe("guest")
        expect(kit.tokenStore.get()).toBeNull()
    })

    it("多处 await 只发一次刷新请求：第二次轮换会让第一次的 token 被作废", async () => {
        const { kit, refresh } = makeKit()

        await Promise.all([kit.bootstrapAuth(), kit.bootstrapAuth(), kit.bootstrapAuth()])

        expect(refresh).toHaveBeenCalledTimes(1)
    })

    it("刷新时上报设备 ID：后端按它决定吊销粒度", async () => {
        const { kit, refresh } = makeKit()
        const deviceId = kit.getDeviceId()

        await kit.bootstrapAuth()

        expect(refresh).toHaveBeenCalledWith(deviceId)
    })

    it("登出后重新静默刷新：cookie 还有效就不必整页重载才能再进来", async () => {
        // bootstrapPromise 不清 → 登出那次 guest 永远生效，重登后守卫仍把人挡在门外
        const { kit, refresh } = makeKit()
        await kit.bootstrapAuth()
        kit.tokenStore.clear()

        await kit.bootstrapAuth()

        expect(refresh).toHaveBeenCalledTimes(2)
        expect(kit.authState.getStatus()).toBe("authed")
    })

    it("自己裁决出的 guest 保留结论：未登录时每次受保护导航都重打刷新，纯属白请求", async () => {
        const { kit, refresh } = makeKit(async () => {
            throw new Error("401")
        })

        await kit.bootstrapAuth()
        await kit.bootstrapAuth()

        expect(refresh).toHaveBeenCalledTimes(1)
        expect(kit.authState.getStatus()).toBe("guest")
    })

    it("已登录直接放行：登录成功后守卫不该再打一次刷新", async () => {
        const { kit, refresh } = makeKit()
        kit.tokenStore.set("at-from-login")

        await kit.bootstrapAuth()

        expect(refresh).not.toHaveBeenCalled()
        expect(kit.authState.getStatus()).toBe("authed")
    })
})

describe("设备 ID", () => {
    it("首次生成后落 localStorage：同一浏览器下次打开还是这台设备", () => {
        const { kit } = makeKit()

        const first = kit.getDeviceId()

        expect(first).toMatch(/^[0-9a-f-]{36}$/)
        expect(storage.data.get("shop_device_id")).toBe(first)
    })

    it("已有存量值就直接用：重新生成就等于换了一台设备，旧会话白登", () => {
        storage.data.set("shop_device_id", "stored-device")

        expect(makeKit().kit.getDeviceId()).toBe("stored-device")
    })

    it("deviceKey 分端隔离：web 与 admin 各一份设备 ID，不互相顶号", () => {
        const web = createAuthKit({ refresh: async () => ({ accessToken: "a" }) })
        const admin = createAuthKit({
            refresh: async () => ({ accessToken: "a" }),
            deviceKey: "shop_admin_device_id",
        })

        expect(web.getDeviceId()).not.toBe(admin.getDeviceId())
        expect(storage.data.has("shop_device_id")).toBe(true)
        expect(storage.data.has("shop_admin_device_id")).toBe(true)
    })
})
