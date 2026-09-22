import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"

import type { MyCouponResponse } from "@shop/api/sdk"
import { Toaster } from "@shop/ui-web"
import { server } from "@shop/test-utils"

import { createAppTestQueryClient } from "@shop/app-kit/test"

import { COUPON_PAGE_SIZE, type CouponTab } from "./coupon"
import { myCouponsOptions, shopClaimableCouponsOptions, useClaimCoupon } from "./queries"

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
        unavailableReason: null,
        ...overrides,
    }
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
    it("请求带上页签状态与分页入参_切页签翻页不会拿到上一组合的数据", async () => {
        let search: URLSearchParams | undefined
        server.use(
            http.get("*/coupons/mine", ({ request }) => {
                search = new URL(request.url).searchParams
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )

        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
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
                        discount: { amount: 1000, currency: "CNY" },
                        validFrom: "2026-01-01T00:00:00Z",
                        validTo: "2026-01-31T00:00:00Z",
                        soldOut: false,
                        // C9 新增：未到发放起点的券也进列表（claimable=false），已开抢的为 true
                        claimable: true,
                    },
                ])
            }),
        )

        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
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
        const queryClient = createAppTestQueryClient()
        // 预置两棵券包缓存：另一页签、另一页码。少失效一棵就会出现「券包页还是旧列表」。
        // key 由 myCouponsOptions 生成 —— 手抄 ["my-coupons", …] 会在 key 形状变化时静默失配
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

        render(
            <QueryClientProvider client={queryClient}>
                <ClaimProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        await waitFor(() => expect(queryClient.getQueryState(unusedKey)?.isInvalidated).toBe(true))
        expect(queryClient.getQueryState(expiredKey)?.isInvalidated).toBe(true)
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
            <QueryClientProvider client={createAppTestQueryClient()}>
                <ClaimProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        await waitFor(() => expect(path).toBe(`/coupons/${TEMPLATE_ID}/claim`))
    })

    it("409 已领过_只弹一条「该券已领取」，不叠加全局的错误提示", async () => {
        server.use(
            http.post("*/coupons/:templateId/claim", () =>
                HttpResponse.json(
                    { detail: "该优惠券已领取", code: "COUPON_ALREADY_CLAIMED" },
                    { status: 409 },
                ),
            ),
        )
        const user = userEvent.setup()

        render(
            <QueryClientProvider client={createAppTestQueryClient()}>
                {/* 挂真 Toaster：这条 bug 的症状就是「同一件事两条提示互相覆盖」，不渲染出来就看不见 */}
                <Toaster />
                <ClaimProbe />
            </QueryClientProvider>,
        )
        await user.click(screen.getByRole("button", { name: "claim" }))

        // 就地那一条 info
        expect(await screen.findByText("该券已领取")).toBeInTheDocument()
        // 全局那条按 detail 弹的错误 toast 必须没出现（`meta.silentError` 退出）。
        // 曾经两条都弹：先一条「该优惠券已领取」的错误提示，紧跟着又一条「该券已领取」
        expect(screen.queryByText("该优惠券已领取")).not.toBeInTheDocument()
    })
})
