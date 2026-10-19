import { describe, expect, it } from "vite-plus/test"

import {
    countNodes,
    markLatest,
    maskName,
    sliceGroups,
    type TrackingGroup,
    type TrackingNode,
} from "./rules"

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

function nth<T>(items: T[], index: number): T {
    const item = items[index]
    if (item === undefined) throw new Error(`期望第 ${index} 个元素存在`)
    return item
}

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
