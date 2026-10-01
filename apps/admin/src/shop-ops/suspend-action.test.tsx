import type { AdminShopItem } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { ShopResumeAction, ShopSuspendAction } from "./suspend-action"

/**
 * 平台封店 / 解封（ACC-60）的行内动作。封店是危险操作——点下去店铺立即停业、在架商品级联下架，
 * 所以钉两件事：① 不点第二下确认就不该发出请求；② 档位不对时按钮根本不该出现（只营业中的店能封、
 * 只已封停的店能解），否则卖家侧会看到一颗点了必 409 的按钮。
 */

const SHOP: AdminShopItem = {
    id: "00000000-0000-4000-8000-0000000000aa",
    name: "海边小店",
    ownerId: "00000000-0000-4000-8000-0000000000ff",
    status: "ACTIVE",
    createdAt: "2026-09-23T10:00:00Z",
}

function useShopRoutes() {
    const calls = { suspend: 0, resume: 0 }
    server.use(
        // 封店/解封都是 204 No Content：契约里那一条返回无体
        http.post("*/admin/shops/:id/suspend", () => {
            calls.suspend += 1
            return new HttpResponse(null, { status: 204 })
        }),
        http.post("*/admin/shops/:id/resume", () => {
            calls.resume += 1
            return new HttpResponse(null, { status: 204 })
        }),
    )
    return calls
}

describe("ShopSuspendAction", () => {
    it("封店：先二次确认，确认这一步才把请求发出去", async () => {
        const calls = useShopRoutes()
        renderWithProviders(<ShopSuspendAction shop={SHOP} />)
        const user = userEvent.setup()

        await user.click(screen.getByRole("button", { name: "封店" }))
        expect(await screen.findByText("封停店铺")).toBeInTheDocument()
        expect(calls.suspend).toBe(0)

        await user.click(screen.getByRole("button", { name: "封停" }))
        await waitFor(() => expect(calls.suspend).toBe(1))
    })

    it("非营业中的店铺不显示封店按钮", () => {
        renderWithProviders(<ShopSuspendAction shop={{ ...SHOP, status: "DISABLED" }} />)
        expect(screen.getByText("不可封店")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "封店" })).toBeNull()
    })
})

describe("ShopResumeAction", () => {
    it("解封：确认后才发请求（恢复营业但不自动重上架）", async () => {
        const calls = useShopRoutes()
        renderWithProviders(<ShopResumeAction shop={{ ...SHOP, status: "DISABLED" }} />)
        const user = userEvent.setup()

        // 触发按钮与确认按钮同名「解封」：弹窗打开后触发那颗被置为 inert，再取同名按钮即确认那颗
        await user.click(screen.getByRole("button", { name: "解封" }))
        expect(await screen.findByText("解封店铺")).toBeInTheDocument()
        expect(calls.resume).toBe(0)

        await user.click(screen.getByRole("button", { name: "解封" }))
        await waitFor(() => expect(calls.resume).toBe(1))
    })

    it("未封停的店铺不显示解封按钮", () => {
        renderWithProviders(<ShopResumeAction shop={SHOP} />)
        expect(screen.getByText("不可解封")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "解封" })).toBeNull()
    })
})
