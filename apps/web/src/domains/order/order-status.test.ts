import { describe, expect, it } from "vite-plus/test"

import {
    closedStatus,
    mainProgressToWire,
    toMainProgressFromWire,
    toStatusFromWire,
    type MainProgress,
} from "./order-status"

describe("toStatusFromWire（子单履约态）", () => {
    it("四个履约态一一映射", () => {
        expect(toStatusFromWire("unshipped")).toBe("unshipped")
        expect(toStatusFromWire("partial_shipped")).toBe("partial_shipped")
        expect(toStatusFromWire("shipped")).toBe("shipped")
        expect(toStatusFromWire("received")).toBe("received")
    })

    it("未知值与空值兜底为待发货：待付款由组级状态表达，不在这里猜", () => {
        expect(toStatusFromWire("PAID")).toBe("unshipped")
        expect(toStatusFromWire("")).toBe("unshipped")
        expect(toStatusFromWire(undefined)).toBe("unshipped")
    })
})

describe("主进度映射（组级展示态 = 页签 = 徽章）", () => {
    it("六个展示态一一映射", () => {
        expect(toMainProgressFromWire("pending_payment")).toBe("pending_payment")
        expect(toMainProgressFromWire("paid")).toBe("paid")
        expect(toMainProgressFromWire("partially_refunded")).toBe("partially_refunded")
        expect(toMainProgressFromWire("refunded")).toBe("refunded")
        expect(toMainProgressFromWire("cancelled")).toBe("cancelled")
        expect(toMainProgressFromWire("closed")).toBe("closed")
    })

    it("未知词收敛到 paid：宁可保守，也不把卡片打成空白", () => {
        expect(toMainProgressFromWire("MYSTERY")).toBe("paid")
        expect(toMainProgressFromWire(undefined)).toBe("paid")
    })

    it("页签上行不转后端枚举：新契约组级状态与 UI 词表同形，直接透传", () => {
        expect(mainProgressToWire("partially_refunded")).toBe("partially_refunded")
        expect(mainProgressToWire("pending_payment")).toBe("pending_payment")
    })

    it("双向映射可还原（wire → ui → wire）", () => {
        const progress: MainProgress[] = [
            "pending_payment",
            "paid",
            "partially_refunded",
            "refunded",
            "cancelled",
            "closed",
        ]
        for (const value of progress) {
            expect(toMainProgressFromWire(mainProgressToWire(value))).toBe(value)
        }
    })
})

describe("closedStatus（子单关闭原因细化）", () => {
    it("买家取消与超时算作 cancelled，其余关闭原因落到 closed", () => {
        expect(closedStatus("buyer_cancelled")).toBe("cancelled")
        expect(closedStatus("timeout")).toBe("cancelled")
        expect(closedStatus("other")).toBe("closed")
    })
})
