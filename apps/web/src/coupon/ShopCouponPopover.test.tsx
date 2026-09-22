import { screen, waitFor } from "@testing-library/react"
import { useQuery } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vitest"

import type { MyCouponResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { tokenStore, useIsLoggedIn, useLoginDialogOpen } from "#/shared/api/auth"
import { renderWithProviders } from "@shop/app-kit/test"

import { ShopCouponPopover } from "./ShopCouponPopover"
import type { ClaimableCoupon } from "./coupon"
import { shopClaimableCouponsOptions } from "./queries"

/**
 * 商品详情页的领券入口：可领券列表、领券请求、已领完/已领过的就地反馈、未登录拉起登录框、
 * 以及「该店无券不给空浮层」。只 mock HTTP（MSW），不 mock 业务模块。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const TEMPLATE_A = "00000000-0000-4000-8000-0000000000c1"
const TEMPLATE_B = "00000000-0000-4000-8000-0000000000c2"

/**
 * 显式等待预算。这里的 `findBy*` 每次等的是一个完整往返：MSW → SDK 拦截器 → 投影 → 渲染，
 * 而 RTL 默认只等 1s —— 那是「UI 响应性」的假设，在 28 路并行的 jsdom 里并不成立
 * （实测同一文件单跑整体 1.2s、满载时 4.9s，正好把 1s 卡在边界上，于是随机红）。
 *
 * 放大等待不等于放宽断言：断言内容一个没动，只是把「实现需要多久」与「多久算失败」解耦。
 * 比降并发（拖慢全量）或 `sleep`（凑时间）都更贴近问题本身。
 */
const WAIT = { timeout: 5_000 } as const

afterEach(() => {
    // 登录态是模块级单例，用例之间必须清干净，否则「已登录」会漏到下一个用例
    tokenStore.clear()
})

function makeClaimable(overrides: Partial<ClaimableCoupon> = {}): ClaimableCoupon {
    return {
        id: TEMPLATE_A,
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
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

/** 登录态探针：确认未登录点领取走的确实是「拉起全局登录 Dialog」这条路 */
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

/** 可领券查询的落点探针：让「没有入口」的断言发生在数据已到位之后，而不是加载中 */
function ClaimableStateProbe() {
    const { data, isPending } = useQuery(shopClaimableCouponsOptions(SHOP_ID))
    return <span>{isPending ? "券列表加载中" : `券列表 ${data?.length ?? 0} 张`}</span>
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
        // claimable=false 且 soldOut=false = 还没开抢（C9）；开抢时刻文案跟着 validFrom，时区无关的断言用后缀
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
        // 登录弹窗开关是模块级单例，先归零再验这一次点击真的把它打开了
        await user.click(await screen.findByRole("button", { name: "关闭登录弹窗" }, WAIT))
        await openPopover(user)
        await user.click(await screen.findByRole("button", { name: "领取 满 ¥100 减 ¥10" }, WAIT))

        expect(await screen.findByText("登录弹窗已打开", undefined, WAIT)).toBeVisible()
        expect(claimedPath).toBeUndefined()
    })

    it("该店没有可领券_不渲染领券入口，点开一个空浮层比看不到入口更困惑", async () => {
        useClaimableList([])

        renderEntry()

        // 等数据真正落定（空列表）再断言入口不存在，否则只是「还在加载」
        expect(await screen.findByText("券列表 0 张", undefined, WAIT)).toBeVisible()
        expect(screen.queryByRole("button", { name: "领券" })).toBeNull()
    })
})
