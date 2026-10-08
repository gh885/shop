import { describe, expect, it } from "vite-plus/test"

import {
    countNodes,
    formatNodeTime,
    markLatest,
    maskName,
    sliceGroups,
    type TrackingGroup,
    type TrackingNode,
} from "./model"

/** 夹具：轴节点（默认非最新、非异常，测试只覆盖它关心的维度） */
function makeNode(overrides: Partial<TrackingNode> & Pick<TrackingNode, "key">): TrackingNode {
    return {
        time: "07-28 11:12",
        location: null,
        text: "快件已到达",
        latest: false,
        abnormal: false,
        ...overrides,
    }
}

function makeGroup(key: string, label: string, nodes: TrackingNode[]): TrackingGroup {
    return { key, label, abnormal: false, nodes }
}

/** 夹具访问器：`noUncheckedIndexedAccess` 下 `groups[0]` 是可选值；测试里取不到就该炸，不是静默跳过 */
function nth<T>(items: T[], index: number): T {
    const item = items[index]
    if (item === undefined) throw new Error(`期望第 ${index} 个元素存在`)
    return item
}

describe("formatNodeTime", () => {
    it("同年只给月日：轴上每条都带年份太吵，而轴内的相对先后已经由顺序表达", () => {
        expect(
            formatNodeTime("2026-07-28T11:12:00+08:00", "zh-Hans-CN", new Date("2026-09-01")),
        ).toBe("07-28 11:12")
    })

    it("跨年补年份：去年 12 月与今年 12 月只给月日在同一条轴上分不开", () => {
        expect(
            formatNodeTime("2025-12-28T11:12:00+08:00", "zh-Hans-CN", new Date("2026-01-05")),
        ).toBe("2025-12-28 11:12")
    })

    it("两种形状都跟着传入的 Locale：英文界面拿到的是英文形状，不是抄来的模式串", () => {
        expect(formatNodeTime("2026-07-28T11:12:00+08:00", "en-US", new Date("2026-09-01"))).toBe(
            "Jul 28, 11:12",
        )
        expect(formatNodeTime("2025-12-28T11:12:00+08:00", "en-US", new Date("2026-01-05"))).toBe(
            "Dec 28, 2025, 11:12 AM",
        )
    })

    it("非法时间原样返回，不显示 Invalid Date", () => {
        expect(formatNodeTime("不是时间", "zh-Hans-CN")).toBe("不是时间")
    })
})

describe("sliceGroups", () => {
    const groups = [
        makeGroup("a", "已签收", [makeNode({ key: "a-1" }), makeNode({ key: "a-2" })]),
        makeGroup("b", "运输中", [makeNode({ key: "b-1" }), makeNode({ key: "b-2" })]),
    ]

    it("折叠按轴序取最新 N 条，且被抽空的段整体丢弃", () => {
        const kept = sliceGroups(groups, 3)

        expect(kept.map((g) => [g.key, g.nodes.map((n) => n.key)])).toEqual([
            ["a", ["a-1", "a-2"]],
            ["b", ["b-1"]],
        ])
    })

    it("保留段结构而不是摊平：续行脱离段标题后只剩一个没有意义的时间", () => {
        const kept = sliceGroups(groups, 2)

        expect(kept).toHaveLength(1)
        expect(nth(kept, 0).label).toBe("已签收")
    })

    it("N 为 0 时不留下空壳段", () => {
        expect(sliceGroups(groups, 0)).toEqual([])
    })
})

describe("markLatest", () => {
    it("只在轴顶标一处：高亮重复出现等于没有高亮", () => {
        const marked = markLatest([
            makeGroup("a", "已签收", [makeNode({ key: "a-1" })]),
            makeGroup("b", "运输中", [makeNode({ key: "b-1" }), makeNode({ key: "b-2" })]),
        ])

        expect(marked.flatMap((g) => g.nodes.map((n) => n.latest))).toEqual([true, false, false])
    })

    it("空轴不炸（未发货/无节点）", () => {
        expect(markLatest([])).toEqual([])
    })
})

describe("countNodes", () => {
    it("跨段累计，折叠阈值判定用", () => {
        expect(
            countNodes([
                makeGroup("a", "已签收", [makeNode({ key: "a-1" })]),
                makeGroup("b", "运输中", [makeNode({ key: "b-1" }), makeNode({ key: "b-2" })]),
            ]),
        ).toBe(3)
    })
})

describe("maskName", () => {
    it("首字保留、其余掩掉", () => {
        expect(maskName("张三")).toBe("张*")
        expect(maskName("欧阳修")).toBe("欧**")
    })

    it("单字姓名原样返回", () => {
        expect(maskName("李")).toBe("李")
    })
})
