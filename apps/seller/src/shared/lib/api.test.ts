import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { logout, tokenStore } from "./api"
import { getCurrentShopId, setCurrentShopId } from "./shop-store"

/**
 * 登出清态的**范围**：不止 access token。
 *
 * X-Shop-Id 由请求拦截器从 localStorage 的当前店铺键取，登出漏清它，
 * 下一个用同一浏览器登录的账号就会替上一个人发请求 —— 哪怕他根本不在那家店。
 */
describe("seller 登出", () => {
    beforeEach(() => {
        localStorage.clear()
        server.use(http.post("*/auth/logout", () => HttpResponse.json({})))
    })

    it("清掉当前店铺：店铺上下文不跨账号残留", async () => {
        setCurrentShopId("shop-a")
        tokenStore.set("at-1")

        await logout()

        expect(localStorage.getItem("shop_seller_current_shop")).toBeNull()
        expect(getCurrentShopId()).toBeUndefined()
        expect(tokenStore.get()).toBeNull()
    })

    it("登出接口失败也照清：本地状态不该等后端点头", async () => {
        server.use(http.post("*/auth/logout", () => new HttpResponse(null, { status: 500 })))
        setCurrentShopId("shop-b")

        await logout()

        expect(getCurrentShopId()).toBeUndefined()
    })
})
