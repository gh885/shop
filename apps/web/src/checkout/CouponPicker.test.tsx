import type { Coupon, PreviewResponse } from "@shop/api/sdk"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vite-plus/test"

import type { ReactElement } from "react"

import { renderWithProviders as renderWithBase } from "@shop/app-kit/test"

import { webMessages } from "#/locales"
import { makeCoupon } from "@shop/test-utils"

import { type CheckoutGroup } from "./rules"
import { toCheckoutPreview } from "./mapper"
import { CouponPicker } from "./CouponPicker"

const SHOP_1 = "11111111-1111-4111-8111-111111111111"
const COUPON_USABLE = "55555555-5555-4555-8555-555555555555"
const COUPON_UNUSABLE = "66666666-6666-4666-8666-666666666666"

function makeGroup(opts: { coupons: Coupon[]; discountAmount?: number }): CheckoutGroup {
    const dto: PreviewResponse = {
        groups: [
            {
                shopId: SHOP_1,
                shopName: "测试店",
                lines: [],
                itemAmount: { amount: 20000, currency: "CNY" },
                shippingFee: { amount: 0, currency: "CNY" },
                discountAmount: { amount: opts.discountAmount ?? 0, currency: "CNY" },
                payAmount: { amount: 20000, currency: "CNY" },
                deliverable: true,
                coupons: opts.coupons,
                appliedCouponId: null,
            },
        ],
        unavailable: [],
        address: null,
        totalPayAmount: { amount: 20000, currency: "CNY" },
    }
    const group = toCheckoutPreview(dto).groups[0]
    if (!group) throw new Error("夹具缺分组")
    return group
}

function renderWithProviders(ui: ReactElement) {
    return renderWithBase(ui, { resources: webMessages })
}

describe("CouponPicker", () => {
    it("触发入口报已减金额：优惠是算出来的，不是券面额", () => {
        renderWithProviders(
            <CouponPicker
                group={makeGroup({
                    coupons: [
                        makeCoupon({ userCouponId: COUPON_USABLE }),
                        makeCoupon({
                            userCouponId: COUPON_UNUSABLE,
                            threshold: { amount: 20000, currency: "CNY" },
                            discount: { amount: 2000, currency: "CNY" },
                            usable: false,
                            unavailableReason: "THRESHOLD_NOT_MET",
                        }),
                    ],
                    discountAmount: 1000,
                })}
                selectedId={COUPON_USABLE}
                onSelect={vi.fn<(id: string | null) => void>()}
            />,
        )

        expect(screen.getByRole("button", { name: "已减 ¥10" })).toBeInTheDocument()
    })

    it("没选券时不说「已减 ¥0」：说的是有几张能用、你还没用", () => {
        renderWithProviders(
            <CouponPicker
                group={makeGroup({ coupons: [makeCoupon({ userCouponId: COUPON_USABLE })] })}
                selectedId={null}
                onSelect={vi.fn<(id: string | null) => void>()}
            />,
        )

        expect(screen.getByRole("button", { name: /1 张可用，未使用/ })).toBeInTheDocument()
    })

    it("不可用券置灰且写明原因_点它不会改变选择", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn<(id: string | null) => void>()
        renderWithProviders(
            <CouponPicker
                group={makeGroup({
                    coupons: [
                        makeCoupon({ userCouponId: COUPON_USABLE }),
                        makeCoupon({
                            userCouponId: COUPON_UNUSABLE,
                            threshold: { amount: 20000, currency: "CNY" },
                            discount: { amount: 2000, currency: "CNY" },
                            usable: false,
                            unavailableReason: "THRESHOLD_NOT_MET",
                        }),
                    ],
                })}
                selectedId={COUPON_USABLE}
                onSelect={onSelect}
            />,
        )

        await user.click(screen.getByRole("button", { name: /已减/ }))

        const unusable = await screen.findByRole("radio", { name: /满 ¥200 减 ¥20/ })
        // BaseUI 的 radio 不是原生控件，"置灰不可选"落在 aria-disabled 上（读屏也读得到）
        expect(unusable).toHaveAttribute("aria-disabled", "true")
        expect(screen.getByText("未达到优惠券的使用门槛")).toBeInTheDocument()

        await user.click(unusable)
        expect(onSelect).not.toHaveBeenCalled()
    })

    it("选中一张可用券_把券 id 交回页面（换券由此触发重新预览）", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn<(id: string | null) => void>()
        renderWithProviders(
            <CouponPicker
                group={makeGroup({
                    coupons: [makeCoupon({ userCouponId: COUPON_USABLE })],
                })}
                selectedId={null}
                onSelect={onSelect}
            />,
        )

        await user.click(screen.getByRole("button", { name: /1 张可用/ }))
        await user.click(await screen.findByRole("radio", { name: /满 ¥100 减 ¥10/ }))

        expect(onSelect).toHaveBeenCalledWith(COUPON_USABLE)
    })

    it("选择「不使用优惠券」_回调 null 而不是空串（null 才是明确不用券）", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn<(id: string | null) => void>()
        renderWithProviders(
            <CouponPicker
                group={makeGroup({ coupons: [makeCoupon({ userCouponId: COUPON_USABLE })] })}
                selectedId={COUPON_USABLE}
                onSelect={onSelect}
            />,
        )

        await user.click(screen.getByRole("button", { name: /已减/ }))
        await user.click(await screen.findByRole("radio", { name: "不使用优惠券" }))

        expect(onSelect).toHaveBeenCalledWith(null)
    })

    it("本店没有券候选_只给一句「本店暂无可用优惠券」，不开空弹层", () => {
        renderWithProviders(
            <CouponPicker
                group={makeGroup({ coupons: [] })}
                selectedId={null}
                onSelect={vi.fn<(id: string | null) => void>()}
            />,
        )

        expect(screen.getByText("本店暂无可用优惠券")).toBeInTheDocument()
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("有候选但一张都不可用_仍可点开看原因（不能只说「暂无」而不给解释）", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <CouponPicker
                group={makeGroup({
                    coupons: [
                        makeCoupon({
                            userCouponId: COUPON_UNUSABLE,
                            usable: false,
                            unavailableReason: "EXPIRED",
                        }),
                    ],
                })}
                selectedId={null}
                onSelect={vi.fn<(id: string | null) => void>()}
            />,
        )

        await user.click(screen.getByRole("button", { name: "本店暂无可用优惠券" }))

        expect(await screen.findByText("优惠券已过期")).toBeInTheDocument()
    })
})
