import { describe, expect, it } from "vitest"

import {
    DEFAULT_REFUND_TAB,
    REFUND_TABS,
    RefundTabSchema,
    refundRowActions,
    refundTabToStatus,
} from "./model"

/**
 * 工作台纯规则：谁是待办、一行此刻能点哪一个按钮、URL 里的筛选值怎么收窄。
 * 这些分支错了不会报错，只会让卖家在错的单上点错的按钮，或者看到一份"不知怎么筛出来的"列表。
 */

describe("refundRowActions（卖家对一行能做什么——消费行上下发的 availableActions）", () => {
    it("待处理_契约给同意与拒绝_两个方向都有出口", () => {
        expect(
            refundRowActions({ status: "APPLYING", availableActions: ["AGREE", "REJECT"] }),
        ).toEqual(["agree", "reject"])
    })

    it("退货中_契约只给确认收货：货没回来之前没有第二个选项", () => {
        expect(
            refundRowActions({ status: "RETURNING", availableActions: ["RECEIVE_RETURN"] }),
        ).toEqual(["receive"])
    })

    it("终态_后端给空集_这里就空", () => {
        expect(refundRowActions({ status: "REFUNDED", availableActions: [] })).toEqual([])
    })
})

describe("页签与 URL 筛选值", () => {
    it("默认落在待处理：售后有时效，进来先看待办而不是历史", () => {
        expect(DEFAULT_REFUND_TAB).toBe("APPLYING")
    })

    it("全部放在最后：待办在前、历史在后，总览不抢第一眼", () => {
        expect(REFUND_TABS[0]?.value).toBe("APPLYING")
        expect(REFUND_TABS.at(-1)?.value).toBe("ALL")
    })

    it("ALL 映射为不筛，其余原样透给后端", () => {
        expect(refundTabToStatus("ALL")).toBeUndefined()
        expect(refundTabToStatus("RETURNING")).toBe("RETURNING")
    })

    it("地址栏乱填_回落到默认页签，而不是把脏值送给后端换一个 400", () => {
        expect(RefundTabSchema.parse("NOT_A_STATUS")).toBe("APPLYING")
        expect(RefundTabSchema.parse(undefined)).toBe("APPLYING")
        expect(RefundTabSchema.parse("REFUNDED")).toBe("REFUNDED")
        expect(RefundTabSchema.parse("ALL")).toBe("ALL")
    })

    it("每个页签都有中文文案（新增状态忘了配页签，这里会红）", () => {
        for (const tab of REFUND_TABS) {
            expect(tab.label.length).toBeGreaterThan(0)
        }
    })
})
