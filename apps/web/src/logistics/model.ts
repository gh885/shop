import { isValid } from "date-fns"
import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

import { formatDateTime, formatTimeShort } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/i18n"
import { isSamePlatformYear } from "@shop/i18n"
import type {
    ShipmentDirection,
    ShipmentStatus,
    TrackingNodeCode,
    TrackingStage,
} from "@shop/api/sdk"

/**
 * 发货单履约四态（docs/domain/order-model.md §4.4）：待发货 → 已发出 → 已签收；旁支已取消。
 *
 * <p>它表达的是「这张包裹走到哪一步」，不是轨迹阶段：轨迹只用来展示（见 {@link TRACKING_STAGE_KEY}），
 * 不再反过来决定包裹状态。
 */
export const SHIPMENT_STATUS_KEY: Record<ShipmentStatus, WebLogisticsStatusKey> = {
    PENDING_DISPATCH: "logistics.status.PENDING_DISPATCH",
    DISPATCHED: "logistics.status.DISPATCHED",
    DELIVERED: "logistics.status.DELIVERED",
    CANCELLED: "logistics.status.CANCELLED",
}

export function shipmentStatusLabel(status: ShipmentStatus, t: WebTranslate): string {
    return t(SHIPMENT_STATUS_KEY[status])
}

/** 轨迹阶段：时间线按它分组的标题，只服务于展示 */
export const TRACKING_STAGE_KEY: Record<TrackingStage, WebLogisticsStageKey> = {
    PICKED_UP: "logistics.stage.PICKED_UP",
    IN_TRANSIT: "logistics.stage.IN_TRANSIT",
    DELIVERING: "logistics.stage.DELIVERING",
    DELIVERED: "logistics.stage.DELIVERED",
    RETURNED: "logistics.stage.RETURNED",
    EXCEPTION: "logistics.stage.EXCEPTION",
}

export function trackingStageLabel(stage: TrackingStage, t: WebTranslate): string {
    return t(TRACKING_STAGE_KEY[stage])
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
type WebLogisticsStageKey = Extract<WebMessageKey, `logistics.stage.${string}`>
type WebLogisticsNodeKey = Extract<WebMessageKey, `logistics.node.${string}`>
