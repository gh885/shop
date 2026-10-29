import { describe, expect, it } from "vite-plus/test"

import { RMA_TABS } from "./constants"
import { DEFAULT_RMA_TAB, rmaListSearchSchema, rmaTabToStatus, RmaTabSchema } from "./search"

// 页签/URL 筛选的分支错了不报错，只会让卖家看到一份"不知怎么筛出来的"列表

describe("页签与 URL 筛选值", () => {
    it("默认落在待处理：售后有时效，进来先看待办而不是历史", () => {
        expect(DEFAULT_RMA_TAB).toBe("applied")
    })

    it("全部放在最后：待办在前、历史在后，总览不抢第一眼", () => {
        expect(RMA_TABS[0]?.value).toBe("applied")
        expect(RMA_TABS.at(-1)?.value).toBe("ALL")
    })

    it("ALL 映射为不筛，其余原样透给后端", () => {
        expect(rmaTabToStatus("ALL")).toBeUndefined()
        expect(rmaTabToStatus("shipping_back")).toBe("shipping_back")
    })

    it("地址栏乱填_回落到默认页签，而不是把脏值送给后端换一个 400", () => {
        expect(RmaTabSchema.parse("NOT_A_STATUS")).toBe("applied")
        expect(RmaTabSchema.parse(undefined)).toBe("applied")
        expect(RmaTabSchema.parse("completed")).toBe("completed")
        expect(RmaTabSchema.parse("ALL")).toBe("ALL")
    })

    it("列表搜索参数：缺省页签回落到待办，游标可选", () => {
        expect(rmaListSearchSchema.parse({})).toEqual({ status: "applied" })
        expect(rmaListSearchSchema.parse({ status: "received", cursor: "c-1" })).toEqual({
            status: "received",
            cursor: "c-1",
        })
    })
})
