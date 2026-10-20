import { MainProgress as WireMainProgress } from "@shop/api/sdk"
import { describe, expect, it } from "vite-plus/test"

import {
    mainProgressToWire,
    toMainProgressFromWire,
    toStatusFromWire,
    type MainProgress,
} from "./order-status"

describe("toStatusFromWire", () => {
    it("子订单五个 wire 状态一一映射（部分发货是新加的那一档）", () => {
        expect(toStatusFromWire("PAID")).toBe("pending_shipment")
        expect(toStatusFromWire("PARTIALLY_SHIPPED")).toBe("partially_shipped")
        expect(toStatusFromWire("SHIPPED")).toBe("pending_receipt")
        expect(toStatusFromWire("COMPLETED")).toBe("completed")
        expect(toStatusFromWire("CANCELLED")).toBe("cancelled")
    })

    it("未知值与空值兜底为待发货：待付款由主订单表达，不在这里猜", () => {
        expect(toStatusFromWire("REFUNDING")).toBe("pending_shipment")
        expect(toStatusFromWire("")).toBe("pending_shipment")
        expect(toStatusFromWire(undefined)).toBe("pending_shipment")
    })
})

describe("主进度映射", () => {
    it("六个 wire 值一一映射", () => {
        expect(toMainProgressFromWire("PENDING_PAYMENT")).toBe("pending_payment")
        expect(toMainProgressFromWire("PENDING_SHIPMENT")).toBe("pending_shipment")
        expect(toMainProgressFromWire("PARTIALLY_SHIPPED")).toBe("partially_shipped")
        expect(toMainProgressFromWire("PENDING_RECEIPT")).toBe("pending_receipt")
        expect(toMainProgressFromWire("COMPLETED")).toBe("completed")
        expect(toMainProgressFromWire("CLOSED")).toBe("closed")
    })

    it("页签上行转后端枚举：不把 UI 的小写字面量塞进请求", () => {
        expect(mainProgressToWire("partially_shipped")).toBe(WireMainProgress.PARTIALLY_SHIPPED)
        expect(mainProgressToWire("pending_receipt")).toBe(WireMainProgress.PENDING_RECEIPT)
    })

    it("双向映射可还原（wire → ui → wire）", () => {
        const progress: MainProgress[] = [
            "pending_payment",
            "pending_shipment",
            "partially_shipped",
            "pending_receipt",
            "completed",
            "closed",
        ]
        for (const value of progress) {
            expect(toMainProgressFromWire(mainProgressToWire(value))).toBe(value)
        }
    })
})
