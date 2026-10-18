import { describe, expect, it } from "vite-plus/test"

import { DEFAULT_REFUND_TAB, REFUND_TABS, RefundTabSchema, refundTabToStatus } from "./model"

// 页签/URL 筛选的分支错了不报错，只会让卖家看到一份"不知怎么筛出来的"列表

describe("页签与 URL 筛选值", () => {
    it("默认落在待处理：退款有时效，进来先看待办而不是历史", () => {
        expect(DEFAULT_REFUND_TAB).toBe("PENDING")
    })

    it("全部放在最后：待办在前、历史在后，总览不抢第一眼", () => {
        expect(REFUND_TABS[0]?.value).toBe("PENDING")
        expect(REFUND_TABS.at(-1)?.value).toBe("ALL")
    })

    it("ALL 映射为不筛，其余原样透给后端", () => {
        expect(refundTabToStatus("ALL")).toBeUndefined()
        expect(refundTabToStatus("RETURN_PENDING")).toBe("RETURN_PENDING")
    })

    it("地址栏乱填_回落到默认页签，而不是把脏值送给后端换一个 400", () => {
        expect(RefundTabSchema.parse("NOT_A_STATUS")).toBe("PENDING")
        expect(RefundTabSchema.parse(undefined)).toBe("PENDING")
        expect(RefundTabSchema.parse("REFUNDED")).toBe("REFUNDED")
        expect(RefundTabSchema.parse("ALL")).toBe("ALL")
    })
})
