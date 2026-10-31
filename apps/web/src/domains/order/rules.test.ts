import { describe, expect, it } from "vite-plus/test"

import { deriveOrderActions, type OrderAction, type MainProgress } from "./rules"
import { toOrderActionItems } from "./display"

type OrderActions = { status: MainProgress }

function makeOrder(overrides: Partial<OrderActions> = {}): OrderActions {
    return { status: "pending_payment", ...overrides }
}

const keys = (order: OrderActions, surface: "card" | "detail") => deriveOrderActions(order, surface)

const primary = (order: OrderActions, surface: "card" | "detail") =>
    toOrderActionItems(deriveOrderActions(order, surface), order.status, surface)
        .filter((item) => item.variant === "default")
        .map((item) => item.key)

describe("deriveOrderActions", () => {
    it("待付款：付款与取消在卡片与详情都出现，主操作是付款", () => {
        expect(keys(makeOrder(), "card")).toEqual(["pay", "cancel"])
        expect(keys(makeOrder(), "detail")).toEqual(["pay", "cancel"])
        expect(primary(makeOrder(), "detail")).toEqual(["pay"])
        expect(
            toOrderActionItems(
                deriveOrderActions(makeOrder(), "detail"),
                "pending_payment",
                "detail",
            ),
        ).toEqual([
            { key: "pay", variant: "default" },
            { key: "cancel", variant: "outline" },
        ])
    })

    it("已付款：卡片不给动作，详情补「确认收货」且它是主操作（查看物流收进店铺段内）", () => {
        const order = makeOrder({ status: "paid" })

        expect(keys(order, "card")).toEqual([])
        expect(keys(order, "detail")).toEqual(["confirm"])
        expect(primary(order, "detail")).toEqual(["confirm"])
    })

    it("部分退款与已付款同口径：确认收货只在详情", () => {
        const order = makeOrder({ status: "partially_refunded" })

        expect(keys(order, "card")).toEqual([])
        expect(keys(order, "detail")).toEqual(["confirm"])
        expect(primary(order, "detail")).toEqual(["confirm"])
    })

    it("终态（退款完成/已取消/已关闭）：卡片不画动作，详情页给「再买一单」与「加入购物车」", () => {
        for (const status of ["refunded", "cancelled", "closed"] as const) {
            const order = makeOrder({ status })
            expect(keys(order, "card")).toEqual([])
            expect(keys(order, "detail")).toEqual(["rebuy", "add_cart"])
            expect(primary(order, "detail")).toEqual([])
        }
    })

    it("动作集合只由组级状态推出：后端不下发 availableActions，前端不凭空造按钮", () => {
        const all: OrderAction[] = ["pay", "cancel", "confirm", "rebuy", "add_cart"]
        for (const status of [
            "pending_payment",
            "paid",
            "partially_refunded",
            "refunded",
            "cancelled",
            "closed",
        ] as const) {
            for (const surface of ["card", "detail"] as const) {
                for (const action of keys(makeOrder({ status }), surface)) {
                    expect(all).toContain(action)
                }
            }
        }
    })
})
