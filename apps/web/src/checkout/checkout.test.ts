import type { PreviewResponse } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { makeCoupon, server } from "@shop/test-utils"

import { createAppTestHookClient } from "@shop/app-kit/test"

import type { CheckoutGroup, CouponSelection } from "./checkout"
import { couponIdsOf, defaultCouponId, toCheckoutPreview, withDefaultCoupons } from "./checkout"
import { checkoutPreviewOptions, useCreateOrder } from "./queries"

/**
 * 测试夹具：PreviewResponse wire 形状的可控构造。
 *
 * 券相关维度：候选顺序（后端已排好，前端只取 head）、usable / unavailableReason、
 * 每店独立选券。id 全是真 UUID —— 走 HTTP 的用例会被 SDK 的 zod 响应校验拦下，
 * 假 id 会在"请求发出去了吗"之前就炸成契约错误。
 */
const MONEY = { amount: 19900, currency: "CNY" }
const ZERO_MONEY = { amount: 0, currency: "CNY" }

const SHOP_1 = "11111111-1111-4111-8111-111111111111"
const SHOP_2 = "22222222-2222-4222-8222-222222222222"
const SKU_1 = "33333333-3333-4333-8333-333333333333"
const PRODUCT_1 = "44444444-4444-4444-8444-444444444444"
const COUPON_1 = "55555555-5555-4555-8555-555555555555"
const COUPON_2 = "66666666-6666-4666-8666-666666666666"
const ADDRESS_1 = "88888888-8888-4888-8888-888888888888"

type GroupDto = PreviewResponse["groups"][number]

function makeGroupDto(overrides: Partial<GroupDto> = {}): GroupDto {
    return {
        shopId: SHOP_1,
        shopName: "测试店",
        lines: [
            {
                skuId: SKU_1,
                productId: PRODUCT_1,
                name: "测试商品",
                image: null,
                price: MONEY,
                originalPrice: MONEY,
                quantity: 1,
                stock: 5,
            },
        ],
        itemAmount: MONEY,
        shippingFee: ZERO_MONEY,
        // 券三件套：默认不用券（无候选、无减免、未选中）
        discountAmount: ZERO_MONEY,
        payAmount: MONEY,
        deliverable: true,
        coupons: [],
        appliedCouponId: null,
        ...overrides,
    }
}

function makeDto(
    opts: {
        groups?: GroupDto[]
        lineImage?: string | null
        unavailableImage?: string | null
        address?: PreviewResponse["address"]
    } = {},
): PreviewResponse {
    const group = makeGroupDto()
    const line = group.lines[0]!
    line.image = opts.lineImage ?? null
    return {
        groups: opts.groups ?? [group],
        unavailable: [
            {
                skuId: SKU_1,
                name: "失效商品",
                image: opts.unavailableImage ?? null,
                quantity: 1,
                cause: "SOLD_OUT",
            },
        ],
        address: opts.address ?? {
            id: ADDRESS_1,
            receiverName: "张三",
            receiverPhone: "13800000000",
            province: "广东省",
            city: "深圳市",
            district: "南山区",
            detail: "科技园 1 号",
        },
        totalPayAmount: MONEY,
    }
}

/** 投影后的第一个分组：纯逻辑用例要的是领域形状，不是 wire */
function firstGroup(overrides: Partial<GroupDto> = {}): CheckoutGroup {
    const group = toCheckoutPreview(makeDto({ groups: [makeGroupDto(overrides)] })).groups[0]
    if (!group) throw new Error("夹具缺分组")
    return group
}

const SOURCE = { lines: [{ skuId: SKU_1, quantity: 1 }] }

describe("toCheckoutPreview", () => {
    it("行明细与失效行的主图 null 归一为 undefined，UI 层无需再判 null", () => {
        const preview = toCheckoutPreview(makeDto())

        expect(preview.groups[0]?.lines[0]?.image).toBeUndefined()
        expect(preview.unavailable[0]?.image).toBeUndefined()
    })

    it("有图时如实透传，不吞真实 URL", () => {
        const preview = toCheckoutPreview(
            makeDto({ lineImage: "img/a.png", unavailableImage: "img/b.png" }),
        )

        expect(preview.groups[0]?.lines[0]?.image).toBe("img/a.png")
        expect(preview.unavailable[0]?.image).toBe("img/b.png")
    })

    it("分组结构与金额字段原样保留：不造假默认值", () => {
        const dto = makeDto()
        const preview = toCheckoutPreview(dto)

        expect(preview.groups).toMatchObject([
            { shopId: SHOP_1, shopName: "测试店", itemAmount: MONEY, payAmount: MONEY },
        ])
        expect(preview.totalPayAmount).toEqual(dto.totalPayAmount)
    })

    it("券三件套（减免 / 候选 / 已选）原样透传：减多少由后端算，前端不重算", () => {
        const preview = toCheckoutPreview(
            makeDto({
                groups: [
                    makeGroupDto({
                        discountAmount: { amount: 1000, currency: "CNY" },
                        coupons: [makeCoupon({ userCouponId: COUPON_1 })],
                        appliedCouponId: COUPON_1,
                    }),
                ],
            }),
        )

        expect(preview.groups[0]).toMatchObject({
            discountAmount: { amount: 1000, currency: "CNY" },
            appliedCouponId: COUPON_1,
        })
        expect(preview.groups[0]?.coupons).toHaveLength(1)
    })

    it("地址回显原样透传：字段不重排不造默认值", () => {
        expect(toCheckoutPreview(makeDto()).address).toMatchObject({
            receiverName: "张三",
            receiverPhone: "13800000000",
            detail: "科技园 1 号",
        })
    })
})

describe("defaultCouponId（默认选中第一张可用券）", () => {
    it("候选已由后端排序_取 head 而不是自己比较面额", () => {
        const group = firstGroup({
            coupons: [
                makeCoupon({ userCouponId: COUPON_1, discount: { amount: 1000, currency: "CNY" } }),
                makeCoupon({ userCouponId: COUPON_2, discount: { amount: 5000, currency: "CNY" } }),
            ],
        })

        expect(defaultCouponId(group)).toBe(COUPON_1)
    })

    it("第一张不可用_跳过它选下一张可用的（不可用的券前端不选）", () => {
        const group = firstGroup({
            coupons: [
                makeCoupon({
                    userCouponId: COUPON_1,
                    usable: false,
                    unavailableReason: "THRESHOLD_NOT_MET",
                }),
                makeCoupon({ userCouponId: COUPON_2 }),
            ],
        })

        expect(defaultCouponId(group)).toBe(COUPON_2)
    })

    it("一张可用的都没有 / 根本没有候选_默认不用券", () => {
        const allUnusable = firstGroup({
            coupons: [
                makeCoupon({
                    userCouponId: COUPON_1,
                    usable: false,
                    unavailableReason: "EXPIRED",
                }),
            ],
        })

        expect(defaultCouponId(allUnusable)).toBeNull()
        expect(defaultCouponId(firstGroup())).toBeNull()
    })
})

describe("couponIdsOf（每店选中券 → 请求体 userCouponIds）", () => {
    it("多店各自独立选券_两店的券都发出去，未选/不用的店不发", () => {
        const selection: CouponSelection = {
            [SHOP_1]: COUPON_1,
            [SHOP_2]: COUPON_2,
            "other-shop": null,
        }

        expect(couponIdsOf(selection)).toEqual([COUPON_1, COUPON_2])
    })

    it("空串与 null 一律不发券：空值是「这家店不用券」而不是一张券", () => {
        expect(couponIdsOf({ [SHOP_1]: null, [SHOP_2]: "" })).toEqual([])
    })

    it("排序保证同一份选择的顺序稳定：Record 键序取决于点选顺序，不能进 queryKey", () => {
        const a = couponIdsOf({ [SHOP_1]: COUPON_2, [SHOP_2]: COUPON_1 })
        const b = couponIdsOf({ [SHOP_2]: COUPON_1, [SHOP_1]: COUPON_2 })

        expect(a).toEqual(b)
        expect(a).toEqual([COUPON_1, COUPON_2])
    })
})

describe("withDefaultCoupons（首屏填默认，不覆盖用户改过的选择）", () => {
    it("用户还没表态的店_补上第一张可用券", () => {
        const groups = [
            firstGroup({ coupons: [makeCoupon({ userCouponId: COUPON_1 })] }),
            firstGroup({
                shopId: SHOP_2,
                coupons: [
                    makeCoupon({
                        userCouponId: COUPON_2,
                        usable: false,
                        unavailableReason: "EXPIRED",
                    }),
                ],
            }),
        ]

        expect(withDefaultCoupons(groups, {})).toEqual({
            [SHOP_1]: COUPON_1,
            [SHOP_2]: null,
        })
    })

    it("用户改过的选择不被覆盖：换了的保持换了，明确「不用券」的保持不用", () => {
        const groups = [
            firstGroup({
                coupons: [
                    makeCoupon({ userCouponId: COUPON_1 }),
                    makeCoupon({ userCouponId: COUPON_2 }),
                ],
            }),
            firstGroup({
                shopId: SHOP_2,
                coupons: [makeCoupon({ userCouponId: COUPON_2 })],
            }),
        ]

        expect(withDefaultCoupons(groups, { [SHOP_1]: COUPON_2, [SHOP_2]: null })).toEqual({
            [SHOP_1]: COUPON_2,
            [SHOP_2]: null,
        })
    })

    it("店里已不在本次结算_把它的券丢掉（发给后端只会换来 400）", () => {
        const groups = [firstGroup({ coupons: [makeCoupon({ userCouponId: COUPON_1 })] })]

        expect(withDefaultCoupons(groups, { "shop-gone": COUPON_2 })).toEqual({
            [SHOP_1]: COUPON_1,
        })
    })

    it("没有变化时返回原对象：effect → setState 才不会转成取数循环", () => {
        const choice: CouponSelection = { [SHOP_1]: COUPON_1 }
        const groups = [
            firstGroup({
                coupons: [
                    makeCoupon({ userCouponId: COUPON_1 }),
                    makeCoupon({ userCouponId: COUPON_2 }),
                ],
            }),
        ]

        expect(withDefaultCoupons(groups, choice)).toBe(choice)
    })
})

describe("checkoutPreviewOptions（选券进请求与 queryKey）", () => {
    it("不用券时不带 userCouponIds：空数组不是「传了选择」", async () => {
        const bodies: unknown[] = []
        server.use(
            http.post("*/orders/preview", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeDto())
            }),
        )
        const { wrapper } = createAppTestHookClient()

        renderHook(
            () =>
                useQuery(
                    checkoutPreviewOptions({ source: SOURCE, addressId: ADDRESS_1, coupons: {} }),
                ),
            { wrapper },
        )

        await waitFor(() => expect(bodies).toHaveLength(1))
        expect(bodies[0]).toMatchObject({ addressId: ADDRESS_1 })
        expect(bodies[0]).not.toHaveProperty("userCouponIds")
    })

    it("换券重新预览_新请求带上新的 userCouponIds（预览价必须跟着券走）", async () => {
        const bodies: unknown[] = []
        server.use(
            http.post("*/orders/preview", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeDto())
            }),
        )
        const { wrapper } = createAppTestHookClient()

        const { rerender } = renderHook(
            ({ coupons }: { coupons: CouponSelection }) =>
                useQuery(checkoutPreviewOptions({ source: SOURCE, addressId: ADDRESS_1, coupons })),
            { wrapper, initialProps: { coupons: {} } },
        )
        await waitFor(() => expect(bodies).toHaveLength(1))

        rerender({ coupons: { [SHOP_1]: COUPON_2 } })

        await waitFor(() => expect(bodies).toHaveLength(2))
        expect(bodies[1]).toMatchObject({ userCouponIds: [COUPON_2] })
    })

    it("多店预览把各自的券一起发出去_顺序不影响结果", async () => {
        const bodies: unknown[] = []
        server.use(
            http.post("*/orders/preview", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json(makeDto())
            }),
        )
        const { wrapper } = createAppTestHookClient()

        renderHook(
            () =>
                useQuery(
                    checkoutPreviewOptions({
                        source: SOURCE,
                        addressId: ADDRESS_1,
                        coupons: { [SHOP_1]: COUPON_1, [SHOP_2]: COUPON_2 },
                    }),
                ),
            { wrapper },
        )

        await waitFor(() => expect(bodies).toHaveLength(1))
        expect(bodies[0]).toMatchObject({ userCouponIds: [COUPON_1, COUPON_2] })
    })
})

describe("useCreateOrder（下单带上选中的券）", () => {
    it("提交时把每店选中的券放进 wire 请求体", async () => {
        const bodies: unknown[] = []
        server.use(
            http.post("*/orders/create", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json({
                    orders: [
                        {
                            id: "99999999-9999-4999-8999-999999999999",
                            orderNo: "NO20260906001",
                            shopId: SHOP_1,
                            payAmount: MONEY,
                            payExpireAt: "2026-09-06T12:00:00Z",
                        },
                    ],
                })
            }),
        )
        const { wrapper } = createAppTestHookClient()
        const { result } = renderHook(() => useCreateOrder(), { wrapper })

        await result.current.mutateAsync({
            addressId: ADDRESS_1,
            source: SOURCE,
            coupons: { [SHOP_1]: COUPON_1, [SHOP_2]: null },
        })

        await waitFor(() => expect(bodies).toHaveLength(1))
        expect(bodies[0]).toMatchObject({
            addressId: ADDRESS_1,
            userCouponIds: [COUPON_1],
            lines: SOURCE.lines,
        })
    })

    it("不选券时请求体里不出现 userCouponIds：不把「不用券」写成一张空券", async () => {
        const bodies: unknown[] = []
        server.use(
            http.post("*/orders/create", async ({ request }) => {
                bodies.push(await request.json())
                return HttpResponse.json({ orders: [] })
            }),
        )
        const { wrapper } = createAppTestHookClient()
        const { result } = renderHook(() => useCreateOrder(), { wrapper })

        await result.current.mutateAsync({ addressId: ADDRESS_1, source: SOURCE, coupons: {} })

        await waitFor(() => expect(bodies).toHaveLength(1))
        expect(bodies[0]).not.toHaveProperty("userCouponIds")
    })
})
