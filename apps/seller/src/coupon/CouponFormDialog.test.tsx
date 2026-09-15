import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CouponTemplateResponse, ShopResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { renderWithProviders } from "#/test/render"
import { tokenStore } from "#/shared/lib/api"
import { setCurrentShopId } from "#/shop"

import { CouponFormDialog } from "./CouponFormDialog"

/**
 * 新建券弹窗的接线测试：走真实 React Query + MSW，断言**线上请求体**。
 *
 * 拦在客户端与送到后端的必须一致：金额以分为单位、时间带时区。
 * 只断言组件内部 state 会漏掉投影这一层——而投影写错就是「100 元券变 1 元券」。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"

const shop: ShopResponse = {
    id: SHOP_ID,
    ownerId: "00000000-0000-4000-8000-0000000000dd",
    name: "测试店",
    logoKey: null,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
}

/** 建券回执：字段形状必须过 SDK 的 zod 校验 */
function makeCreated(overrides: Partial<CouponTemplateResponse> = {}): CouponTemplateResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        name: "新春满减券",
        threshold: { amount: 10000, currency: "CNY" },
        discount: { amount: 1000, currency: "CNY" },
        validFrom: "2026-01-01T10:00:00Z",
        validTo: "2026-02-01T10:00:00Z",
        totalQuantity: 50,
        issuedQuantity: 0,
        usedQuantity: 0,
        status: "ACTIVE",
        createdAt: "2025-12-20T08:00:00Z",
        ...overrides,
    }
}

/** 登录态 + 店铺上下文：失效 key 带 shopId，店铺没就位时失效的是另一棵树 */
function useShopContext() {
    tokenStore.set("test-access-token")
    server.use(http.get("*/shops/mine", () => HttpResponse.json([shop])))
    setCurrentShopId(SHOP_ID)
}

describe("CouponFormDialog", () => {
    afterEach(() => {
        tokenStore.clear()
        setCurrentShopId(undefined)
    })

    it("提交：元换算成分、本地时间转成带时区 ISO 时刻，弹窗关闭", async () => {
        const user = userEvent.setup()
        const onOpenChange = vi.fn<(open: boolean) => void>()
        let body: unknown
        useShopContext()
        server.use(
            http.post("*/seller/coupons", async ({ request }) => {
                body = await request.json()
                return HttpResponse.json(makeCreated(), { status: 201 })
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={onOpenChange}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "新春满减券")
        const threshold = screen.getByLabelText("使用门槛（元）")
        await user.clear(threshold)
        await user.type(threshold, "100")
        await user.type(screen.getByLabelText("面额（元）"), "10")
        const total = screen.getByLabelText("发放总量")
        await user.clear(total)
        await user.type(total, "50")
        // datetime-local 的自由输入不可靠，直接给控件一个确定的值
        fireEvent.change(screen.getByLabelText("有效期起点"), {
            target: { value: "2026-01-01T10:00" },
        })
        fireEvent.change(screen.getByLabelText("有效期终点"), {
            target: { value: "2026-02-01T10:00" },
        })

        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(body).toBeDefined())
        expect(body).toMatchObject({
            name: "新春满减券",
            thresholdAmount: 10000,
            discountAmount: 1000,
            totalQuantity: 50,
        })
        // 本地 10:00 是同一个瞬间，但必须以带时区的 ISO 发给 OffsetDateTime
        const validFrom =
            typeof body === "object" && body !== null && "validFrom" in body
                ? body.validFrom
                : undefined
        expect(Date.parse(String(validFrom))).toBe(Date.parse("2026-01-01T10:00"))
        expect(String(validFrom)).toMatch(/Z$/)
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("门槛填 0：按无门槛原样提交 0，不是被当成缺填丢掉", async () => {
        const user = userEvent.setup()
        let body: unknown
        useShopContext()
        server.use(
            http.post("*/seller/coupons", async ({ request }) => {
                body = await request.json()
                return HttpResponse.json(
                    makeCreated({ threshold: { amount: 0, currency: "CNY" } }),
                    { status: 201 },
                )
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={() => undefined}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "无门槛券")
        await user.type(screen.getByLabelText("面额（元）"), "10")
        fireEvent.change(screen.getByLabelText("有效期起点"), {
            target: { value: "2026-01-01T10:00" },
        })
        fireEvent.change(screen.getByLabelText("有效期终点"), {
            target: { value: "2026-02-01T10:00" },
        })
        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(body).toBeDefined())
        expect(body).toMatchObject({ thresholdAmount: 0 })
    })

    it("面额大于门槛：拦在本地并说明原因，不发请求", async () => {
        const user = userEvent.setup()
        const posted = vi.fn<() => void>()
        useShopContext()
        server.use(
            http.post("*/seller/coupons", () => {
                posted()
                return HttpResponse.json(makeCreated(), { status: 201 })
            }),
        )

        renderWithProviders(
            <CouponFormDialog
                open
                onOpenChange={() => undefined}
            />,
        )

        await user.type(await screen.findByLabelText("券名"), "填反了的券")
        const threshold = screen.getByLabelText("使用门槛（元）")
        await user.clear(threshold)
        await user.type(threshold, "10")
        await user.type(screen.getByLabelText("面额（元）"), "20")
        fireEvent.change(screen.getByLabelText("有效期起点"), {
            target: { value: "2026-01-01T10:00" },
        })
        fireEvent.change(screen.getByLabelText("有效期终点"), {
            target: { value: "2026-02-01T10:00" },
        })
        await user.click(screen.getByRole("button", { name: "创建" }))

        expect(await screen.findByText("面额不能超过使用门槛，请检查是否填反")).toBeInTheDocument()
        expect(posted).not.toHaveBeenCalled()
    })
})
