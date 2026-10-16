import type { ShipmentTrackingResponse, TrackingNodeResponse } from "@shop/api/sdk"
import { describe, expect, it } from "vite-plus/test"

import { buildMerchantGroups, buildShipmentTracks, buildTrackingGroups } from "./tracking"
import type { WebTranslate } from "#/locales/messages.gen"

const zh = "zh-Hans-CN" as const

const echo: WebTranslate = (key: string, ..._args: unknown[]) => key

function makeNode(
    overrides: Partial<TrackingNodeResponse> &
        Pick<TrackingNodeResponse, "nodeCode" | "status" | "occurredAt">,
): TrackingNodeResponse {
    return { description: null, location: null, ...overrides }
}

function makeShipment(overrides: Partial<ShipmentTrackingResponse> = {}): ShipmentTrackingResponse {
    return {
        direction: "FORWARD",
        carrierName: "申通快递",
        trackingNo: "773433522905985",
        status: "DELIVERED",
        shippedAt: "2026-07-26T09:06:00+08:00",
        deliveredAt: "2026-07-29T18:35:00+08:00",
        nodes: [],
        ...overrides,
    }
}

function nth<T>(items: T[], index: number): T {
    const item = items[index]
    if (item === undefined) throw new Error(`期望第 ${index} 个元素存在`)
    return item
}

function makeOrderTimeline(overrides: { createdAt?: string; shippedAt?: string | null } = {}) {
    return {
        createdAt: "2026-07-26T01:41:00+08:00",
        shippedAt: "2026-07-26T09:06:00+08:00" as string | null,
        ...overrides,
    }
}

describe("buildTrackingGroups", () => {
    it("后端给正序，轴要倒序：最上面一条必须是刚发生的事", () => {
        const groups = buildTrackingGroups(
            [
                makeNode({
                    nodeCode: "PICKED_UP",
                    status: "PICKED_UP",
                    occurredAt: "2026-07-26T14:09:00+08:00",
                }),
                makeNode({
                    nodeCode: "DELIVERED",
                    status: "DELIVERED",
                    occurredAt: "2026-07-29T18:35:00+08:00",
                }),
            ],
            zh,
            echo,
        )

        expect(groups.map((g) => g.label)).toEqual([
            "logistics.status.DELIVERED",
            "logistics.status.PICKED_UP",
        ])
    })

    it("到达与离开分拨同属「运输中」：轨迹要细，段标题要粗", () => {
        const groups = buildTrackingGroups(
            [
                makeNode({
                    nodeCode: "ARRIVED_HUB",
                    status: "IN_TRANSIT",
                    occurredAt: "2026-07-26T23:10:00+08:00",
                }),
                makeNode({
                    nodeCode: "DEPARTED_HUB",
                    status: "IN_TRANSIT",
                    occurredAt: "2026-07-26T23:12:00+08:00",
                }),
            ],
            zh,
            echo,
        )

        expect(groups).toHaveLength(1)
        expect(nth(groups, 0).nodes).toHaveLength(2)
        expect(nth(groups, 0).nodes.map((n) => n.time)).toEqual(["07-26 23:12", "07-26 23:10"])
    })

    it("同一状态被别的状态打断后再次出现时分成两段，段 key 不撞", () => {
        const groups = buildTrackingGroups(
            [
                makeNode({
                    nodeCode: "OUT_FOR_DELIVERY",
                    status: "DELIVERING",
                    occurredAt: "2026-07-28T10:00:00+08:00",
                }),
                makeNode({
                    nodeCode: "EXCEPTION",
                    status: "EXCEPTION",
                    occurredAt: "2026-07-28T12:00:00+08:00",
                }),
                makeNode({
                    nodeCode: "OUT_FOR_DELIVERY",
                    status: "DELIVERING",
                    occurredAt: "2026-07-28T15:00:00+08:00",
                }),
            ],
            zh,
            echo,
        )

        expect(groups.map((g) => g.label)).toEqual([
            "logistics.status.DELIVERING",
            "logistics.status.EXCEPTION",
            "logistics.status.DELIVERING",
        ])
        expect(new Set(groups.map((g) => g.key)).size).toBe(3)
    })

    it("承运商只给状态码不给描述时兜底文案，不留空行", () => {
        const groups = buildTrackingGroups(
            [
                makeNode({
                    nodeCode: "ARRIVED_HUB",
                    status: "IN_TRANSIT",
                    occurredAt: "2026-07-26T23:10:00+08:00",
                    description: "   ",
                }),
            ],
            zh,
            echo,
        )

        expect(nth(nth(groups, 0).nodes, 0).text).toBe("logistics.node.ARRIVED_HUB")
    })

    it("异常段整段标红（含段内续行），不是只标那一条", () => {
        const groups = buildTrackingGroups(
            [
                makeNode({
                    nodeCode: "EXCEPTION",
                    status: "EXCEPTION",
                    occurredAt: "2026-07-27T10:00:00+08:00",
                }),
                makeNode({
                    nodeCode: "EXCEPTION",
                    status: "EXCEPTION",
                    occurredAt: "2026-07-27T11:00:00+08:00",
                }),
            ],
            zh,
            echo,
        )

        expect(nth(groups, 0).abnormal).toBe(true)
        expect(nth(groups, 0).nodes.every((n) => n.abnormal)).toBe(true)
    })

    it("无节点（已发货未揽收）给空轴，不造假的占位节点", () => {
        expect(buildTrackingGroups([], zh, echo)).toEqual([])
    })
})

describe("buildMerchantGroups", () => {
    it("未发货只有「已下单」：发货时刻还没发生，不能提前画一条", () => {
        const groups = buildMerchantGroups(makeOrderTimeline({ shippedAt: null }), zh, echo)

        expect(groups.map((g) => g.label)).toEqual(["logistics.order.placed.label"])
        expect(nth(nth(groups, 0).nodes, 0).text).toBe("logistics.order.placed.text")
    })

    it("已发货时两条按新 → 旧排，发货在下单之上", () => {
        const groups = buildMerchantGroups(makeOrderTimeline(), zh, echo)

        expect(groups.map((g) => g.label)).toEqual([
            "logistics.order.shipped.label",
            "logistics.order.placed.label",
        ])
        expect(nth(nth(groups, 0).nodes, 0).time).toBe("07-26 09:06")
    })
})

describe("buildShipmentTracks", () => {
    const order = makeOrderTimeline()

    it("商家侧事件只并进首个正向包裹：多包裹时每条轴都挂一遍就是把「已下单」讲了三遍", () => {
        const tracks = buildShipmentTracks(
            [
                makeShipment({ trackingNo: "A" }),
                makeShipment({ trackingNo: "B", direction: "RETURN", carrierName: "顺丰速运" }),
            ],
            zh,
            order,
            echo,
        )

        expect(nth(tracks, 0).groups.at(-1)?.label).toBe("logistics.order.placed.label")
        expect(nth(tracks, 1).groups.some((g) => g.label === "logistics.order.placed.label")).toBe(
            false,
        )
    })

    it("每条轴各有一个最新节点（高亮按轴计，不是全页只准一处）", () => {
        const tracks = buildShipmentTracks(
            [
                makeShipment({
                    trackingNo: "A",
                    nodes: [
                        makeNode({
                            nodeCode: "DELIVERED",
                            status: "DELIVERED",
                            occurredAt: "2026-07-29T18:35:00+08:00",
                        }),
                    ],
                }),
                makeShipment({
                    trackingNo: "B",
                    direction: "RETURN",
                    nodes: [
                        makeNode({
                            nodeCode: "PICKED_UP",
                            status: "PICKED_UP",
                            occurredAt: "2026-08-02T09:00:00+08:00",
                        }),
                    ],
                }),
            ],
            zh,
            order,
            echo,
        )

        expect(
            tracks.map((t) => t.groups.flatMap((g) => g.nodes).filter((n) => n.latest).length),
        ).toEqual([1, 1])
    })

    it("订单详情还没到时不合成商家侧事件，先只画包裹事实", () => {
        const tracks = buildShipmentTracks([makeShipment()], zh, undefined, echo)

        expect(nth(tracks, 0).groups).toEqual([])
    })

    it("已发货未揽收时，最新高亮落到「已发货」上（否则整条轴一处高亮都没有）", () => {
        const tracks = buildShipmentTracks(
            [makeShipment({ status: "PENDING_PICKUP" })],
            zh,
            order,
            echo,
        )

        const timeline = nth(tracks, 0).groups

        expect(nth(timeline, 0).label).toBe("logistics.order.shipped.label")
        expect(nth(nth(timeline, 0).nodes, 0).latest).toBe(true)
    })
})
