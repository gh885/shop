import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"

import type { MyCouponResponse } from "@shop/api/sdk"
import { createTestQueryClient, server } from "@shop/test-utils"

import { COUPON_PAGE_SIZE, type CouponTab } from "./coupon"
import { useClaimCoupon, useMyCoupons, useShopClaimableCoupons } from "./queries"

/**
 * 券数据层：钉住两件容易出错、出错又很难看出来的事 ——
 * 1. 券包 queryKey 与请求参数要带全 status/page/size，否则切页签会读到上一组合的缓存；
 * 2. 领券成功要失效**整棵**券包缓存（状态页签 × 分页都是同一份数据的切片）。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000c1"

function makeMyCouponResponse(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000c9",
        shopId: SHOP_ID,
        shopName: "测试店",
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        discount: { amount: 1000, currency: "CNY" },
        effectiveAt: "2026-01-01T00:00:00Z",
        expireAt: "2026-01-31T00:00:00Z",
        status: "UNUSED",
        source: "CLAIM",
        orderId: null,
        ...overrides,
    }
}

function MyCouponsProbe({ status, page }: { status: CouponTab; page: number }) {
    const { data, isPending } = useMyCoupons(status, page)
    return <span data-testid="state">{isPending ? "loading" : String(data?.total ?? 0)}</span>
}

function ClaimProbe() {
    const claim = useClaimCoupon()
    return <button onClick={() => claim.mutate(TEMPLATE_ID)}>claim</button>
}

function ClaimableProbe({ shopId }: { shopId: string }) {
    const { data } = useShopClaimableCoupons(shopId)
    return <span data-testid="count">{String(data?.length ?? 0)}</span>
}

describe("useMyCoupons", () => {
    it("请求带上页签状态与分页入参_切页签翻页不会拿到上一组合的数据", async () => {
        let search: URLSearchParams | undefined
        server.use(
            http.get("*/coupons/mine", ({ request }) => {
                search = new URL(request.url).searchParams
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <MyCouponsProbe
                    status="USED"
                    page={2}
                />
            </QueryClientProvider>,
        )

        await waitFor(() => expect(search).toBeDefined())
        expect(search?.get("status")).toBe("USED")
        expect(search?.get("page")).toBe("2")
        expect(search?.get("size")).toBe(String(COUPON_PAGE_SIZE))
    })
})

describe("useShopClaimableCoupons", () => {
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
                        discount: { amount: 1000, currency: "CNY" },
                        validFrom: "2026-01-01T00:00:00Z",
                        validTo: "2026-01-31T00:00:00Z",
                        soldOut: false,
                    },
                ])
            }),
        )

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <ClaimableProbe shopId={SHOP_ID} />
            </QueryClientProvider>,
        )

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
        const queryClient = createTestQueryClient()
        // 预置两棵券包缓存：另一页签、另一页码。少失效一棵就会出现「券包页还是旧列表」
        queryClient.setQueryData(["my-coupons", "UNUSED", 2, COUPON_PAGE_SIZE], {
            records: [],
            total: 0,
        })
        queryClient.setQueryData(["my-coupons", "EXPIRED", 1, COUPON_PAGE_SIZE], {
            records: [],
            total: 0,
        })
        const user = userEvent.setup()

        render(
            <QueryClientProvider client={queryClient}>
                <ClaimProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        await waitFor(() =>
            expect(
                queryClient.getQueryState(["my-coupons", "UNUSED", 2, COUPON_PAGE_SIZE])
                    ?.isInvalidated,
            ).toBe(true),
        )
        expect(
            queryClient.getQueryState(["my-coupons", "EXPIRED", 1, COUPON_PAGE_SIZE])
                ?.isInvalidated,
        ).toBe(true)
    })

    it("领取请求打到券模板的领取端点_模板 id 在路径上", async () => {
        let path: string | undefined
        server.use(
            http.post("*/coupons/:templateId/claim", ({ request }) => {
                path = new URL(request.url).pathname
                return HttpResponse.json(makeMyCouponResponse(), { status: 201 })
            }),
        )
        const user = userEvent.setup()

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <ClaimProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        await waitFor(() => expect(path).toBe(`/coupons/${TEMPLATE_ID}/claim`))
    })
})
