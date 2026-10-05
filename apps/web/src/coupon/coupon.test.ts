import { describe, expect, it } from "vite-plus/test"

import type { MyCouponResponse } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import { makeMyCouponResponse as makeContractCoupon } from "@shop/test-utils/fixtures"

import {
    COUPON_TABS,
    couponTimeReasonHint,
    groupByStatus,
    isCouponAlreadyClaimed,
    toMyCoupon,
    type MyCoupon,
} from "./coupon"

/**
 * coupon 领域纯逻辑：wire→领域投影、页签定义、按状态分组、券面时间灰字的给出条件、领券错误判定。
 *
 * 关心的都是「藏着一个错的映射 / 反的布尔 / 漏掉的兜底就会红」的分支：
 * null→undefined 的归一、先到先得闸门不被改写、LOCKED 与 UNUSED 的分组顺序、
 * 以及「409 但没有 code」不能当成已领过。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const COUPON_ID = "00000000-0000-4000-8000-0000000000c1"
const ORDER_ID = "00000000-0000-4000-8000-0000000000e1"

/** 券包的一行：契约夹具套上本文件断言用的那批 id */
function makeMyCouponResponse(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return makeContractCoupon({ id: COUPON_ID, shopId: SHOP_ID, ...overrides })
}

function makeMyCoupon(overrides: Partial<MyCoupon> = {}): MyCoupon {
    return { ...toMyCoupon(makeMyCouponResponse()), ...overrides }
}

describe("toMyCoupon", () => {
    it("未关联订单的券_orderId 归一到 undefined 而不是空串", () => {
        expect(toMyCoupon(makeMyCouponResponse()).orderId).toBeUndefined()
    })

    it("已核销的券带上订单 id_券包能顺着它跳回订单详情", () => {
        expect(toMyCoupon(makeMyCouponResponse({ orderId: ORDER_ID })).orderId).toBe(ORDER_ID)
    })

    it("无门槛券的 threshold 原样透传 0_不补一个假门槛", () => {
        const coupon = toMyCoupon(
            makeMyCouponResponse({ threshold: { amount: 0, currency: "CNY" } }),
        )

        expect(coupon.threshold).toEqual({ amount: 0, currency: "CNY" })
    })

    it("展示状态取后端算出来的值_不是库里那个可能已过期的原始状态", () => {
        expect(toMyCoupon(makeMyCouponResponse({ status: "EXPIRED" })).status).toBe("EXPIRED")
    })
})

describe("COUPON_TABS", () => {
    it("页签从状态表派生 catalog 键_与卡片徽章读同一张表（不再是手抄的中文）", () => {
        expect(COUPON_TABS).toEqual([
            { value: "UNUSED", labelKey: "web.coupon.status.UNUSED" },
            { value: "USED", labelKey: "web.coupon.status.USED" },
            { value: "EXPIRED", labelKey: "web.coupon.status.EXPIRED" },
        ])
    })
})

describe("groupByStatus", () => {
    it("未使用页签里混进结算中的券_未使用在前、结算中另成一组", () => {
        const locked = makeMyCoupon({ id: "locked", status: "LOCKED" })
        const unused = makeMyCoupon({ id: "unused", status: "UNUSED" })

        const groups = groupByStatus([locked, unused])

        expect(groups.map((g) => [g.status, g.coupons.map((c) => c.id)])).toEqual([
            ["UNUSED", ["unused"]],
            ["LOCKED", ["locked"]],
        ])
    })

    it("契约新增的状态值排在已知状态之后_不会插到未使用前面", () => {
        const groups = groupByStatus([
            makeMyCoupon({ id: "new", status: "SOMETHING_NEW" }),
            makeMyCoupon({ id: "unused", status: "UNUSED" }),
        ])

        expect(groups.map((g) => g.status)).toEqual(["UNUSED", "SOMETHING_NEW"])
    })

    it("同一状态内的券保持接口返回顺序_分组不重排列表", () => {
        const groups = groupByStatus([
            makeMyCoupon({ id: "a" }),
            makeMyCoupon({ id: "b" }),
            makeMyCoupon({ id: "c" }),
        ])

        expect(groups).toHaveLength(1)
        expect(groups[0]?.coupons.map((c) => c.id)).toEqual(["a", "b", "c"])
    })
})

describe("couponTimeReasonHint", () => {
    it("还没生效的券_灰字给出起用时间，日期按传入的 Locale 渲染", () => {
        const coupon = makeMyCoupon({ unavailableReason: "NOT_EFFECTIVE" })

        expect(couponTimeReasonHint(coupon, "zh-CN")).toEqual({
            key: "web.coupon.reason.notEffective",
            datetime: formatDateTime(coupon.effectiveAt, "zh-CN"),
        })
        expect(couponTimeReasonHint(coupon, "en-US")).toEqual({
            key: "web.coupon.reason.notEffective",
            datetime: formatDateTime(coupon.effectiveAt, "en-US"),
        })
    })

    it("结算中但时间已过的券_说清本单之外不能再使用", () => {
        expect(
            couponTimeReasonHint(
                makeMyCoupon({ status: "LOCKED", unavailableReason: "EXPIRED" }),
                "zh-CN",
            ),
        ).toEqual({ key: "web.coupon.reason.expired" })
    })

    it("徽章已解释过的过期不再重复_状态是 EXPIRED 时不给灰字", () => {
        expect(
            couponTimeReasonHint(
                makeMyCoupon({ status: "EXPIRED", unavailableReason: "EXPIRED" }),
                "zh-CN",
            ),
        ).toBeUndefined()
    })

    it("用掉作废的券不承担解释义务_/已使用、已作废一律不给", () => {
        for (const status of ["USED", "VOID"]) {
            expect(
                couponTimeReasonHint(
                    makeMyCoupon({ status, unavailableReason: "EXPIRED" }),
                    "zh-CN",
                ),
            ).toBeUndefined()
        }
    })

    it("没有原因的券不给灰字_不凭空补一句解释", () => {
        expect(couponTimeReasonHint(makeMyCoupon(), "zh-CN")).toBeUndefined()
    })

    it("契约给出新的原因码_不硬翻译成一句假解释", () => {
        expect(
            couponTimeReasonHint(makeMyCoupon({ unavailableReason: "THRESHOLD_NOT_MET" }), "zh-CN"),
        ).toBeUndefined()
    })
})

describe("isCouponAlreadyClaimed", () => {
    it("带 COUPON_ALREADY_CLAIMED 的错误判为已领过（后端两条路径都带这个 code）", () => {
        expect(
            isCouponAlreadyClaimed({
                status: 409,
                detail: "该优惠券已领取",
                code: "COUPON_ALREADY_CLAIMED",
            }),
        ).toBe(true)
    })

    it("409 但没有 code（已领完）不算已领过_否则会把「已领完」说成「已领取」", () => {
        expect(isCouponAlreadyClaimed({ status: 409, detail: "优惠券已领完" })).toBe(false)
    })

    it("网络错误（status 0）不算已领过", () => {
        expect(isCouponAlreadyClaimed(new Error("boom"))).toBe(false)
    })
})
