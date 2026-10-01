import { describe, expect, it } from "vite-plus/test"

import { statusOptions } from "./status-options"

/**
 * 状态表 → 选项：钉「派生」这件事本身的两条约定——顺序跟着表走，`order` 只当子集用。
 * 这两条一旦被改（比如哪天按字母排了），全站页签会一起变样，所以必须有测试拦着。
 */

describe("statusOptions", () => {
    it("纯文案表：按声明顺序出选项（业务顺序写在表里，页签要的就是那个顺序）", () => {
        const labels = { PUBLISHED: "上架中", WAREHOUSE: "仓库中", DRAFT: "草稿" } as const
        expect(statusOptions(labels)).toEqual([
            { value: "PUBLISHED", label: "上架中" },
            { value: "WAREHOUSE", label: "仓库中" },
            { value: "DRAFT", label: "草稿" },
        ])
    })

    it("文案与徽章色同表：只取 label，别的展示字段不进选项", () => {
        const meta = {
            APPLYING: { label: "待处理", variant: "warning" },
            CLOSED: { label: "已撤销", variant: "secondary" },
        } as const
        expect(statusOptions(meta)).toEqual([
            { value: "APPLYING", label: "待处理" },
            { value: "CLOSED", label: "已撤销" },
        ])
    })

    it("给定 order：只出这些值、按给的次序——子集口径（如某状态不设页签）写在调用方", () => {
        const labels = { A: "甲", B: "乙", C: "丙" } as const
        expect(statusOptions(labels, ["C", "A"])).toEqual([
            { value: "C", label: "丙" },
            { value: "A", label: "甲" },
        ])
    })
})
