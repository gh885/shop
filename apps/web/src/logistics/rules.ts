import type { ShipmentDirection, ShipmentStatus, TrackingStage } from "@shop/api/sdk"

/** 本域业务规则唯一出口（rules 槽位）：判定与不依赖语言的推导。纯展示词表在 constants.ts，出文案/展示形状的函数在 display.ts，wire→视图在 mapper.ts */

/** 异常只看阶段：退回与异常要标红，其余正常推进 */
const ABNORMAL_STAGE: ReadonlySet<TrackingStage> = new Set(["EXCEPTION", "RETURNED"])

export function isAbnormalStage(stage: TrackingStage): boolean {
    return ABNORMAL_STAGE.has(stage)
}

export type TrackingNode = {
    key: string
    time: string
    /** 位置前缀，如「晋中市」；商家侧事件为 null */
    location: string | null
    text: string
    latest: boolean
    abnormal: boolean
}
export type TrackingGroup = {
    key: string
    label: string
    abnormal: boolean
    nodes: TrackingNode[]
}

export type ShipmentTrack = {
    direction: ShipmentDirection
    carrierName: string
    trackingNo: string
    status: ShipmentStatus
    groups: TrackingGroup[]
}

export function countNodes(groups: TrackingGroup[]): number {
    return groups.reduce((sum, g) => sum + g.nodes.length, 0)
}

export function sliceGroups(groups: TrackingGroup[], maxNodes: number): TrackingGroup[] {
    const kept: TrackingGroup[] = []
    let budget = maxNodes
    for (const group of groups) {
        if (budget <= 0) break
        const nodes = group.nodes.slice(0, budget)
        budget -= nodes.length
        kept.push({ ...group, nodes })
    }
    return kept
}

export function markLatest(groups: TrackingGroup[]): TrackingGroup[] {
    let marked = false
    return groups.map((group) => ({
        ...group,
        nodes: group.nodes.map((node) => {
            if (marked) return node
            marked = true
            return { ...node, latest: true }
        }),
    }))
}

export type TimelineRow = {
    node: TrackingNode
    key: string
    head: boolean
    label: string
    abnormal: boolean
}

export function toTimelineRows(groups: TrackingGroup[]): TimelineRow[] {
    return groups.flatMap((group) =>
        group.nodes.map((node, index) => ({
            node,
            key: node.key,
            head: index === 0,
            label: group.label,
            abnormal: group.abnormal,
        })),
    )
}

export function maskName(name: string): string {
    return name.length > 1 ? `${name.slice(0, 1)}${"*".repeat(name.length - 1)}` : name
}
