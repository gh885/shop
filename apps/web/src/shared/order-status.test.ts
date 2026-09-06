import { describe, expect, it } from "vitest"

import { statusToWire, toStatusFromWire, type OrderStatus } from "./order-status"

/**
 * 状态机投影测试：重点钉住 PAID → pending_shipment 这条「前端履约流无独立已付款段」的
 * 关键投影，以及未知 wire 值的兜底行为（后端新增/改枚举时不许静默崩溃）。
 */
describe("toStatusFromWire", () => {
    it("五个 wire 状态一一映射", () => {
        expect(toStatusFromWire("PENDING_PAYMENT")).toBe("pending_payment")
        expect(toStatusFromWire("PAID")).toBe("pending_shipment") // 已付款即待发货
        expect(toStatusFromWire("SHIPPED")).toBe("pending_receipt")
        expect(toStatusFromWire("COMPLETED")).toBe("completed")
        expect(toStatusFromWire("CANCELLED")).toBe("cancelled")
    })

    it("未知值与空值兜底为待付款", () => {
        expect(toStatusFromWire("REFUNDING")).toBe("pending_payment")
        expect(toStatusFromWire("")).toBe("pending_payment")
        expect(toStatusFromWire(undefined)).toBe("pending_payment")
    })
})

describe("statusToWire", () => {
    it("领域枚举 → wire 大写枚举（pending_shipment 对应 PAID）", () => {
        expect(statusToWire("pending_payment")).toBe("PENDING_PAYMENT")
        expect(statusToWire("pending_shipment")).toBe("PAID")
        expect(statusToWire("pending_receipt")).toBe("SHIPPED")
        expect(statusToWire("completed")).toBe("COMPLETED")
        expect(statusToWire("cancelled")).toBe("CANCELLED")
    })

    it("双向映射可还原（domain → wire → domain）", () => {
        const domains: OrderStatus[] = [
            "pending_payment",
            "pending_shipment",
            "pending_receipt",
            "completed",
            "cancelled",
        ]
        for (const status of domains) {
            expect(toStatusFromWire(statusToWire(status))).toBe(status)
        }
    })
})
