import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { TrackingGroup, TrackingNode } from "./model"
import { TrackingTimeline } from "./TrackingTimeline"

/** 夹具：已投影好的轴节点（组件不解析 wire，测试也只喂视图模型） */
function makeNode(
    overrides: Partial<TrackingNode> & Pick<TrackingNode, "key" | "text">,
): TrackingNode {
    return {
        time: "07-28 11:12",
        location: null,
        latest: false,
        abnormal: false,
        ...overrides,
    }
}

function makeGroup(key: string, label: string, nodes: TrackingNode[]): TrackingGroup {
    return { key, label, abnormal: false, nodes }
}

/** 三段五节点：交付、运输中（两条续行）、已下单 */
const GROUPS: TrackingGroup[] = [
    makeGroup("delivered", "已签收", [
        makeNode({ key: "d-1", text: "包裹已签收", time: "07-29 18:35", latest: true }),
    ]),
    makeGroup("transit", "运输中", [
        makeNode({ key: "t-1", text: "到达太原转运中心", time: "07-28 11:12" }),
        makeNode({ key: "t-2", text: "到达合肥转运中心", time: "07-26 23:10" }),
    ]),
    makeGroup("placed", "已下单", [
        makeNode({ key: "p-1", text: "商品已经下单", time: "07-26 01:41" }),
    ]),
]

describe("TrackingTimeline", () => {
    it("默认收起只给最新两条，其余按需展开（与淘宝收起态一致）", () => {
        render(<TrackingTimeline groups={GROUPS} />)

        expect(screen.getByText("包裹已签收")).toBeDefined()
        expect(screen.getByText("到达太原转运中心")).toBeDefined()
        expect(screen.queryByText("到达合肥转运中心")).toBeNull()
        expect(screen.getByRole("button", { name: /展开更多物流明细/ })).toBeDefined()
    })

    it("展开后全部节点可见，开关文案与 aria-expanded 同步翻转", async () => {
        const user = userEvent.setup()
        render(<TrackingTimeline groups={GROUPS} />)

        await user.click(screen.getByRole("button", { name: /展开更多物流明细/ }))

        expect(screen.getByText("到达合肥转运中心")).toBeDefined()
        expect(screen.getByText("商品已经下单")).toBeDefined()
        expect(screen.getByRole("button", { name: /收起全部/ }).getAttribute("aria-expanded")).toBe(
            "true",
        )
    })

    it("节点数不超过折叠阈值时不出现开关：给两条也点得开的按钮是假控件", () => {
        render(
            <TrackingTimeline
                groups={GROUPS}
                collapsedCount={5}
            />,
        )

        expect(screen.queryByRole("button", { name: /展开更多物流明细/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /收起全部/ })).toBeNull()
    })

    it("段标题只在段首出现一次，续行不再重复（否则「运输中」会被念两遍）", () => {
        render(
            <TrackingTimeline
                groups={GROUPS}
                defaultExpanded
            />,
        )

        expect(screen.getAllByText("运输中")).toHaveLength(1)
        // 段内续行仍要有自己的时间，否则那条节点就只剩一句没有时间的话
        expect(screen.getByText("07-26 23:10")).toBeDefined()
    })

    it("没有节点时给一句话，而不是一条空轴", () => {
        render(<TrackingTimeline groups={[]} />)

        expect(screen.getByText(/暂无物流轨迹/)).toBeDefined()
    })
})
