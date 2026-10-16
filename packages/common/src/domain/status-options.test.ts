import { describe, expect, it } from "vite-plus/test"

import { statusOptionsFromKeys } from "./status-options"

/** 状态表 → 选项：钉「派生」的两条约定（顺序跟表走、order 只当子集）——一改全站页签一起变样，必须有测试拦着 */

describe("statusOptionsFromKeys", () => {
    it("键表（Record<码值, key>）：派生出带 labelKey 的选项，不出句子", () => {
        const keys = { ON: "app.x.on", OFF: "app.x.off" } as const
        expect(statusOptionsFromKeys(keys)).toEqual([
            { value: "ON", labelKey: "app.x.on" },
            { value: "OFF", labelKey: "app.x.off" },
        ])
    })

    it("键与徽章色同表：只取 labelKey，别的展示字段不进选项", () => {
        const meta = {
            APPLYING: { labelKey: "app.s.applying", variant: "warning" },
            CLOSED: { labelKey: "app.s.closed", variant: "secondary" },
        } as const
        expect(statusOptionsFromKeys(meta)).toEqual([
            { value: "APPLYING", labelKey: "app.s.applying" },
            { value: "CLOSED", labelKey: "app.s.closed" },
        ])
    })

    it("order 子集同样适用：只出给定值、按给定次序", () => {
        const keys = { A: "k.a", B: "k.b", C: "k.c" } as const
        expect(statusOptionsFromKeys(keys, ["C", "A"])).toEqual([
            { value: "C", labelKey: "k.c" },
            { value: "A", labelKey: "k.a" },
        ])
    })
})
