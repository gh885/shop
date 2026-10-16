import { isValid } from "date-fns"
import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

import { formatDateTime, formatTimeShort } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/i18n"
import { isSamePlatformYear } from "@shop/i18n"
import type { ShipmentDirection, ShipmentStatus, TrackingNodeCode } from "@shop/api/sdk"

export const SHIPMENT_STATUS_KEY: Record<ShipmentStatus, WebLogisticsStatusKey> = {
    PENDING_PICKUP: "logistics.status.PENDING_PICKUP",
    PICKED_UP: "logistics.status.PICKED_UP",
    IN_TRANSIT: "logistics.status.IN_TRANSIT",
    DELIVERING: "logistics.status.DELIVERING",
    DELIVERED: "logistics.status.DELIVERED",
    RETURNED: "logistics.status.RETURNED",
    EXCEPTION: "logistics.status.EXCEPTION",
}

export function shipmentStatusLabel(status: ShipmentStatus, t: WebTranslate): string {
    return t(SHIPMENT_STATUS_KEY[status])
}

export const TRACKING_NODE_KEY: Record<TrackingNodeCode, WebLogisticsNodeKey> = {
    PICKED_UP: "logistics.node.PICKED_UP",
    ARRIVED_HUB: "logistics.node.ARRIVED_HUB",
    DEPARTED_HUB: "logistics.node.DEPARTED_HUB",
    OUT_FOR_DELIVERY: "logistics.node.OUT_FOR_DELIVERY",
    DELIVERED: "logistics.node.DELIVERED",
    RETURNED: "logistics.node.RETURNED",
    EXCEPTION: "logistics.node.EXCEPTION",
}

export function trackingNodeLabel(nodeCode: TrackingNodeCode, t: WebTranslate): string {
    return t(TRACKING_NODE_KEY[nodeCode])
}

const ABNORMAL_STATUS: ReadonlySet<ShipmentStatus> = new Set(["EXCEPTION", "RETURNED"])

export function isAbnormalStatus(status: ShipmentStatus): boolean {
    return ABNORMAL_STATUS.has(status)
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

/**
 * 判「今年」用 `isSamePlatformYear` 而不是 `d.getFullYear() === now.getFullYear()`：后者读的是**环境**
 * 时区，而下面两条输出按平台时区（`Asia/Shanghai`）排——UTC 机器上「今年」与输出会差一年
 * （12/31 的轨迹节点在 UTC 还算去年、按 +08 排出来却是今年）。
 */
export function formatNodeTime(iso: string, locale: AppLocale, now: Date = new Date()): string {
    const d = new Date(iso)
    if (!isValid(d)) return iso
    return isSamePlatformYear(d, now) ? formatTimeShort(iso, locale) : formatDateTime(iso, locale)
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

type WebLogisticsStatusKey = Extract<WebMessageKey, `logistics.status.${string}`>
type WebLogisticsNodeKey = Extract<WebMessageKey, `logistics.node.${string}`>
