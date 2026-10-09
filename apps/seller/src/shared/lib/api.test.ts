import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"

import { ShopsApi } from "@shop/api/sdk"
import { apiProblem, server } from "@shop/test-utils"

import { logout, tokenStore } from "./api"
import { getCurrentShopId, setCurrentShopId, syncResolvedShopId } from "./shop-store"

/**
 * 登出清态的**范围**：不止 access token。
 *
 * X-Shop-Id 由请求拦截器从当前有效店铺读取，登出漏清它，
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
        server.use(
            http.post("*/auth/logout", () =>
                HttpResponse.json(apiProblem(500, { detail: "服务器内部错误" }), { status: 500 }),
            ),
        )
        setCurrentShopId("shop-b")

        await logout()

        expect(getCurrentShopId()).toBeUndefined()
    })
})

afterEach(() => {
    tokenStore.clear()
    setCurrentShopId(undefined)
})

it("请求头跟随当前选择和有效兜底，清空后不再注入旧店铺", async () => {
    const headers: Array<string | null> = []
    server.use(
        http.get("*/shops/mine", ({ request }) => {
            headers.push(request.headers.get("X-Shop-Id"))
            return HttpResponse.json([])
        }),
    )

    setCurrentShopId("shop-a")
    await ShopsApi.listMyShops()
    setCurrentShopId("shop-b")
    await ShopsApi.listMyShops()
    syncResolvedShopId("shop-first-active")
    await ShopsApi.listMyShops()
    setCurrentShopId(undefined)
    await ShopsApi.listMyShops()

    expect(headers).toEqual(["shop-a", "shop-b", "shop-first-active", null])
})
