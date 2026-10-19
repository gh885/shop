import type { ReactElement } from "react"

import { screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { renderWithProviders as renderWithBase } from "@shop/app-kit/test"

import { webMessages } from "#/locales"

import { CouponCard } from "./CouponCard"
import type { MyCoupon } from "./coupon"

function makeCoupon(overrides: Partial<MyCoupon> = {}): MyCoupon {
    return {
        id: "00000000-0000-4000-8000-0000000000c9",
        shopId: "00000000-0000-4000-8000-0000000000a1",
        shopName: "测试店",
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        type: "FULL_REDUCTION",
        discount: { amount: 1000, currency: "CNY" },
        effectiveAt: "2026-01-01T00:00:00Z",
        expireAt: "2026-01-31T00:00:00Z",
        status: "UNUSED",
        source: "CLAIM",
        unavailableReason: null,
        ...overrides,
    }
}

function renderWithProviders(ui: ReactElement) {
    return renderWithBase(ui, { resources: webMessages })
}

describe("CouponCard", () => {
    it("满减券：规则句拼门槛与面额，券面给金额", () => {
        renderWithProviders(<CouponCard coupon={makeCoupon()} />)

        expect(screen.getByText("满 ¥100 减 ¥10")).toBeInTheDocument()
        expect(screen.getByText("¥10")).toBeInTheDocument()
    })

    it("折扣券：规则句进折扣率与封顶（CPN-65 封顶不写就等于无限折扣），券面给中文十分位折数", () => {
        renderWithProviders(
            <CouponCard
                coupon={makeCoupon({
                    name: "满200打8折",
                    threshold: { amount: 20000, currency: "CNY" },
                    type: "DISCOUNT",
                    discountRate: 0.8,
                    maxDiscount: { amount: 3000, currency: "CNY" },
                })}
            />,
        )

        expect(screen.getByText("满 ¥200 打 8 折，最高减 ¥30")).toBeInTheDocument()
        expect(screen.getByText("8 折")).toBeInTheDocument()
    })
})
