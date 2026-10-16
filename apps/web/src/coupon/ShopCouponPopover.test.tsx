import type { ReactElement } from "react"

import { screen, waitFor } from "@testing-library/react"
import { useQuery } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vite-plus/test"

import type { MyCouponResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { tokenStore, useIsLoggedIn, useLoginDialogOpen } from "#/shared/api/auth"
import { renderWithProviders as renderWithBase } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { ShopCouponPopover } from "./ShopCouponPopover"
import type { ClaimableCoupon } from "./coupon"
import { shopClaimableCouponsOptions } from "./queries"

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const TEMPLATE_A = "00000000-0000-4000-8000-0000000000c1"
const TEMPLATE_B = "00000000-0000-4000-8000-0000000000c2"

const WAIT = { timeout: 5_000 } as const

afterEach(() => {
    tokenStore.clear()
})

function makeClaimable(overrides: Partial<ClaimableCoupon> = {}): ClaimableCoupon {
    return {
        id: TEMPLATE_A,
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        type: "FULL_REDUCTION",
        discount: { amount: 1000, currency: "CNY" },
        validFrom: "2026-01-01T00:00:00Z",
        validTo: "2026-01-31T00:00:00Z",
        soldOut: false,
        claimable: true,
        ...overrides,
    }
}

function makeClaimedCoupon(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000c9",
        shopId: SHOP_ID,
        shopName: "测试店",
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        type: "FULL_REDUCTION",
        discount: { amount: 1000, currency: "CNY" },
        effectiveAt: "2026-01-01T00:00:00Z",
        expireAt: "2026-01-31T00:00:00Z",
        status: "UNUSED",
        source: "CLAIM",
        orderId: null,
        unavailableReason: null,
        ...overrides,
    }
}

function useClaimableList(coupons: ClaimableCoupon[]) {
    server.use(http.get("*/api/shops/:shopId/coupons", () => HttpResponse.json(coupons)))
}

function AuthProbe() {
    const isLoggedIn = useIsLoggedIn()
    const [open, setOpen] = useLoginDialogOpen()
    return (
        <div>
            <span>{isLoggedIn ? "已登录" : "未登录"}</span>
            <span>{open ? "登录弹窗已打开" : "登录弹窗未打开"}</span>
            <button
                type="button"
                onClick={() => setOpen(false)}
            >
                关闭登录弹窗
            </button>
        </div>
    )
}

function ClaimableStateProbe() {
    const { data, isPending } = useQuery(shopClaimableCouponsOptions(SHOP_ID))
    return <span>{isPending ? "券列表加载中" : `券列表 ${data?.length ?? 0} 张`}</span>
}

function renderWithProviders(ui: ReactElement) {
    return renderWithBase(ui, { resources: webMessages })
}

function renderEntry() {
    renderWithProviders(
        <>
            <ShopCouponPopover shopId={SHOP_ID} />
            <ClaimableStateProbe />
            <AuthProbe />
        </>,
    )
}

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "领券" }, WAIT))
}

describe("ShopCouponPopover", () => {
    it("点开领券列出店内每张券_按钮名带上规则好让读屏用户分清是哪张", async () => {
        const user = userEvent.setup()
        useClaimableList([
            makeClaimable(),
            makeClaimable({
                id: TEMPLATE_B,
                threshold: { amount: 0, currency: "CNY" },
                type: "FULL_REDUCTION",
                discount: { amount: 500, currency: "CNY" },
            }),
        ])

        renderEntry()
        await openPopover(user)

        expect(
            await screen.findByRole("button", { name: "领取 满 ¥100 减 ¥10" }, WAIT),
        ).toBeEnabled()
        expect(screen.getByRole("button", { name: "领取 无门槛减 ¥5" })).toBeEnabled()
    })

    it("已登录点领取_请求打给该券模板且按钮就地变成已领取", async () => {
        tokenStore.set("test-token")
        const user = userEvent.setup()
        let claimedPath: string | undefined
        useClaimableList([makeClaimable()])
        server.use(
            http.post("*/coupons/:templateId/claim", ({ request }) => {
                claimedPath = new URL(request.url).pathname
                return HttpResponse.json(makeClaimedCoupon(), { status: 201 })
            }),
        )

        renderEntry()
        await openPopover(user)
        await user.click(await screen.findByRole("button", { name: "领取 满 ¥100 减 ¥10" }, WAIT))

        await waitFor(() => expect(claimedPath).toBe(`/coupons/${TEMPLATE_A}/claim`))
        expect(
            await screen.findByRole("button", { name: "已领取 满 ¥100 减 ¥10" }, WAIT),
        ).toBeDisabled()
    })

    it("已领完的券按钮上写着「已领完」并禁用_灰色本身说不出原因", async () => {
        const user = userEvent.setup()
        useClaimableList([makeClaimable({ soldOut: true })])

        renderEntry()
        await openPopover(user)

        expect(
            await screen.findByRole("button", { name: "已领完 满 ¥100 减 ¥10" }, WAIT),
        ).toBeDisabled()
    })

    it("未到点的预告券也列出来_按钮写开抢时刻并禁用_点击不发领取请求", async () => {
        const user = userEvent.setup()
        useClaimableList([makeClaimable({ validFrom: "2099-01-02T13:00:00Z", claimable: false })])
        let claimedPath: string | undefined
        server.use(
            http.post("*/coupons/:templateId/claim", ({ request }) => {
                claimedPath = new URL(request.url).pathname
                return HttpResponse.json(makeClaimedCoupon(), { status: 201 })
            }),
        )

        renderEntry()
        await openPopover(user)

        const button = await screen.findByRole("button", { name: /开抢 满 ¥100 减 ¥10/ }, WAIT)
        expect(button).toBeDisabled()
        await user.click(button)
        expect(claimedPath).toBeUndefined()
    })

    it("409 已领过_就地标成已领取而不是提示领取失败", async () => {
        tokenStore.set("test-token")
        const user = userEvent.setup()
        useClaimableList([makeClaimable()])
        server.use(
            http.post("*/coupons/:templateId/claim", () =>
                HttpResponse.json(
                    { status: 409, detail: "该优惠券已领取", code: "COUPON_ALREADY_CLAIMED" },
                    { status: 409 },
                ),
            ),
        )

        renderEntry()
        await openPopover(user)
        await user.click(await screen.findByRole("button", { name: "领取 满 ¥100 减 ¥10" }, WAIT))

        expect(
            await screen.findByRole("button", { name: "已领取 满 ¥100 减 ¥10" }, WAIT),
        ).toBeDisabled()
    })

    it("未登录点领取_不发领券请求，改为拉起登录 Dialog（详情页是匿名通道）", async () => {
        const user = userEvent.setup()
        let claimedPath: string | undefined
        useClaimableList([makeClaimable()])
        server.use(
            http.post("*/coupons/:templateId/claim", ({ request }) => {
                claimedPath = new URL(request.url).pathname
                return HttpResponse.json(makeClaimedCoupon(), { status: 201 })
            }),
        )

        renderEntry()
        await user.click(await screen.findByRole("button", { name: "关闭登录弹窗" }, WAIT))
        await openPopover(user)
        await user.click(await screen.findByRole("button", { name: "领取 满 ¥100 减 ¥10" }, WAIT))

        expect(await screen.findByText("登录弹窗已打开", undefined, WAIT)).toBeVisible()
        expect(claimedPath).toBeUndefined()
    })

    it("该店没有可领券_不渲染领券入口，点开一个空浮层比看不到入口更困惑", async () => {
        useClaimableList([])

        renderEntry()

        expect(await screen.findByText("券列表 0 张", undefined, WAIT)).toBeVisible()
        expect(screen.queryByRole("button", { name: "领券" })).toBeNull()
    })
})
