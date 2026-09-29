import { describe, expect, it } from "vite-plus/test"

import type { Order, OrderAction } from "./model"

import { deriveOrderActions, isShipOverdue } from "./model"

/**
 * 按钮排派生：后端状态机给「能做什么」，前端只定文案、顺序与主次。
 *
 * 钉住三条设计决定：顺序稳定（后端给的是集合，画出来不能每次换位）、
 * 一屏只有一个主操作（橙色）、前端附加动作不与后端重复（同一个「查看物流」画两次）。
 */

type OrderActions = Pick<Order, "status" | "availableActions">

function makeOrder(overrides: Partial<OrderActions> = {}): OrderActions {
    return {
        status: "pending_payment",
        availableActions: [],
        ...overrides,
    }
}

const keys = (order: OrderActions, surface: "card" | "detail") =>
    deriveOrderActions(order, surface).map((item) => item.key)

const primary = (order: OrderActions, surface: "card" | "detail") =>
    deriveOrderActions(order, surface)
        .filter((item) => item.variant === "default")
        .map((item) => item.key)

describe("deriveOrderActions", () => {
    it("主操作只有那一个：待付款的橙色给「去付款」，不是给排在它后面的取消", () => {
        const order = makeOrder({
            availableActions: ["cancel", "pay"] as OrderAction[],
        })

        expect(deriveOrderActions(order, "card")).toEqual([
            { key: "pay", label: "去付款", variant: "default" },
            { key: "cancel", label: "取消订单", variant: undefined },
        ])
    })

    it("待收货：前端补「查看物流」，它排在后端给的确认收货之前", () => {
        const order = makeOrder({
            status: "pending_receipt",
            availableActions: ["confirm"] as OrderAction[],
        })

        expect(keys(order, "card")).toEqual(["logistics", "confirm"])
        expect(primary(order, "card")).toEqual(["confirm"])
    })

    it("后端已经给了查看物流：前端不再追加第二个（同一件事不出现两个按钮）", () => {
        const order = makeOrder({
            status: "pending_receipt",
            availableActions: ["logistics", "confirm"] as OrderAction[],
        })

        expect(keys(order, "card")).toEqual(["logistics", "confirm"])
    })

    it("延长收货按后端下发的资格出现，紧跟「确认收货」之后；资格为假则一个按钮都不多", () => {
        // 数据驱动的动作（ORD-63）：不进「状态 → 动作」静态表，故这里直接给 canExtendReceive
        const order = {
            ...makeOrder({
                status: "pending_receipt",
                availableActions: ["confirm"] as OrderAction[],
            }),
            canExtendReceive: true,
        }

        expect(deriveOrderActions(order, "card").map((item) => item.key)).toEqual([
            "logistics",
            "confirm",
            "extend_receive",
        ])
        expect(primary(order, "card")).toEqual(["confirm"])

        expect(
            keys(makeOrder({ status: "pending_receipt", availableActions: ["confirm"] }), "card"),
        ).toEqual(["logistics", "confirm"])
    })

    it("后端没给的动作不凭空画：前端不再自己按状态推一张「状态 → 按钮」表", () => {
        expect(keys(makeOrder({ status: "pending_shipment" }), "card")).toEqual([])
        expect(keys(makeOrder({ status: "cancelled", availableActions: [] }), "card")).toEqual([
            "rebuy",
        ])
    })

    it("已完成：卡片给「再买一单」但不当主操作，详情页才多一个「加入购物车」并把主操作给它", () => {
        const order = makeOrder({ status: "completed", availableActions: [] })

        expect(keys(order, "card")).toEqual(["rebuy"])
        expect(primary(order, "card")).toEqual([])

        expect(keys(order, "detail")).toEqual(["rebuy", "add_cart"])
        expect(primary(order, "detail")).toEqual(["rebuy"])
    })

    it("卖家视角的动作不会出现在买家页面上：ship 只按后端给的排到最后", () => {
        const order = makeOrder({
            status: "pending_shipment",
            availableActions: ["ship", "cancel"] as OrderAction[],
        })

        expect(keys(order, "card")).toEqual(["cancel", "ship"])
    })
})

describe("isShipOverdue", () => {
    const NOW = Date.parse("2026-01-05T12:00:00Z")

    it("过了发货时限：该把「商家已超时，你可以取消并退款」这句说出来", () => {
        expect(isShipOverdue({ shipExpireAt: "2026-01-05T11:59:59Z" }, NOW)).toBe(true)
    })

    it("还没到点：不打扰用户", () => {
        expect(isShipOverdue({ shipExpireAt: "2026-01-05T12:00:01Z" }, NOW)).toBe(false)
    })

    it("没有时限数据（未付款单）：一律不算超时，不拿 null 去比时间", () => {
        expect(isShipOverdue({ shipExpireAt: null }, NOW)).toBe(false)
    })
})
