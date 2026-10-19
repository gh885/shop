import { useQuery } from "@tanstack/react-query"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import type { MyCouponResponse } from "@shop/api/sdk"
import { Toaster } from "@shop/ui-web"
import { apiProblem, makeMyCouponResponse as makeContractCoupon, server } from "@shop/test-utils"

import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"

import { COUPON_PAGE_SIZE, type CouponTab } from "./rules"
import { myCouponsOptions, shopClaimableCouponsOptions, useClaimCoupon } from "./queries"
import { webMessages } from "#/locales"

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000c1"

function makeMyCouponResponse(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return makeContractCoupon({
        id: "00000000-0000-4000-8000-0000000000c9",
        shopId: SHOP_ID,
        ...overrides,
    })
}

function MyCouponsProbe({ status, page }: { status: CouponTab; page: number }) {
    const { data, isPending } = useQuery(myCouponsOptions(status, page))
    return <span data-testid="state">{isPending ? "loading" : String(data?.total ?? 0)}</span>
}

function ClaimProbe() {
    const claim = useClaimCoupon()
    return (
        <button
            type="button"
            onClick={() => claim.mutate(TEMPLATE_ID)}
        >
            claim
        </button>
    )
}

function ClaimableProbe({ shopId }: { shopId: string }) {
    const { data } = useQuery(shopClaimableCouponsOptions(shopId))
    return <span data-testid="count">{String(data?.length ?? 0)}</span>
}

describe("myCouponsOptions", () => {
    it("未知买家券状态穿过 SDK 响应校验，仍交给展示层兜底", async () => {
        server.use(
            http.get("*/coupons/mine", () =>
                HttpResponse.json({
                    records: [makeMyCouponResponse({ status: "FUTURE_STATUS" })],
                    total: 1,
                }),
            ),
        )
        const client = createAppTestQueryClient()
        const result = await client.query(myCouponsOptions("UNUSED", 1))
        expect(result.records[0]?.status).toBe("FUTURE_STATUS")
        client.clear()
    })

    it("请求带上页签状态与分页入参_切页签翻页不会拿到上一组合的数据", async () => {
        let search: URLSearchParams | undefined
        server.use(
            http.get("*/coupons/mine", ({ request }) => {
                search = new URL(request.url).searchParams
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )

        renderWithProviders(
            <MyCouponsProbe
                status="USED"
                page={2}
            />,
        )

        await waitFor(() => expect(search).toBeDefined())
        expect(search?.get("status")).toBe("USED")
        expect(search?.get("page")).toBe("2")
        expect(search?.get("size")).toBe(String(COUPON_PAGE_SIZE))
    })
})

describe("shopClaimableCouponsOptions", () => {
    it("按店铺 id 拉匿名端点并把可领券列表交给上层", async () => {
        let path: string | undefined
        server.use(
            http.get("*/api/shops/:shopId/coupons", ({ request }) => {
                path = new URL(request.url).pathname
                return HttpResponse.json([
                    {
                        id: TEMPLATE_ID,
                        name: "满100减10",
                        threshold: { amount: 10000, currency: "CNY" },
                        type: "FULL_REDUCTION",
                        discount: { amount: 1000, currency: "CNY" },
                        validFrom: "2026-01-01T00:00:00Z",
                        validTo: "2026-01-31T00:00:00Z",
                        soldOut: false,
                        claimable: true,
                    },
                ])
            }),
        )

        renderWithProviders(<ClaimableProbe shopId={SHOP_ID} />)

        await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"))
        expect(path).toBe(`/api/shops/${SHOP_ID}/coupons`)
    })
})

describe("useClaimCoupon", () => {
    it("领取成功_整棵券包缓存（所有页签与页码）一起失效", async () => {
        server.use(
            http.post("*/coupons/:templateId/claim", () =>
                HttpResponse.json(makeMyCouponResponse(), { status: 201 }),
            ),
        )
        const queryClient = createAppTestQueryClient()
        const unusedKey = myCouponsOptions("UNUSED", 2).queryKey
        const expiredKey = myCouponsOptions("EXPIRED", 1).queryKey
        queryClient.setQueryData(unusedKey, {
            records: [],
            total: 0,
        })
        queryClient.setQueryData(expiredKey, {
            records: [],
            total: 0,
        })
        const user = userEvent.setup()

        renderWithProviders(<ClaimProbe />, { queryClient })
        await user.click(screen.getByRole("button", { name: "claim" }))

        await waitFor(() => expect(queryClient.getQueryState(unusedKey)?.isInvalidated).toBe(true))
        expect(queryClient.getQueryState(expiredKey)?.isInvalidated).toBe(true)
    })

    it("409 已领过_只弹一条「该券已领取」，不叠加全局的错误提示", async () => {
        server.use(
            http.post("*/coupons/:templateId/claim", () =>
                HttpResponse.json(
                    apiProblem(409, {
                        detail: "该优惠券已领取",
                        code: "COUPON_ALREADY_CLAIMED",
                    }),
                    { status: 409 },
                ),
            ),
        )
        const user = userEvent.setup()

        renderWithProviders(
            <>
                <Toaster />
                <ClaimProbe />
            </>,
            { resources: webMessages },
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        expect(await screen.findByText("该券已领取")).toBeInTheDocument()
        expect(screen.queryByText("该优惠券已领取")).not.toBeInTheDocument()
    })
})
