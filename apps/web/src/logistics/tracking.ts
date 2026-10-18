import type { OrderDetail } from "#/order"
import type { WebTranslate } from "#/locales/messages.gen"
import type { ShipmentTrackingResponse, TrackingNodeResponse, TrackingStage } from "@shop/api/sdk"
import type { AppLocale } from "@shop/i18n"
import {
    isAbnormalStage,
    trackingStageLabel,
    trackingNodeLabel,
    formatNodeTime,
    markLatest,
    type ShipmentTrack,
    type TrackingGroup,
    type TrackingNode,
} from "./model"

function toNode(
    node: TrackingNodeResponse,
    key: string,
    abnormal: boolean,
    locale: AppLocale,
    t: WebTranslate,
): TrackingNode {
    return {
        key,
        time: formatNodeTime(node.occurredAt, locale),
        location: node.location,
        text: node.description?.trim() || trackingNodeLabel(node.nodeCode, t),
        latest: false,
        abnormal,
    }
}

/**
 * 轨迹按<b>阶段</b>分组（揽收 / 运输中 / 派送中 / 签收 / 退回 / 异常），不按包裹状态：
 * 包裹只有四态，轨迹却会来几十个节点，用状态分组会把整段运输压成一条。
 */
export function buildTrackingGroups(
    nodes: TrackingNodeResponse[],
    locale: AppLocale,
    t: WebTranslate,
): TrackingGroup[] {
    const ordered = nodes.toSorted(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )

    const groups: { stage: TrackingStage; nodes: TrackingNodeResponse[] }[] = []
    for (const node of ordered) {
        const current = groups.at(-1)
        if (current && current.stage === node.stage) current.nodes.push(node)
        else groups.push({ stage: node.stage, nodes: [node] })
    }

    return groups.map((group, index) => {
        const abnormal = isAbnormalStage(group.stage)
        return {
            key: `${group.stage}-${index}`,
            label: trackingStageLabel(group.stage, t),
            abnormal,
            nodes: group.nodes.map((node, i) => toNode(node, `${index}-${i}`, abnormal, locale, t)),
        }
    })
}

type OrderTimeline = Pick<OrderDetail, "createdAt" | "shippedAt">

export function buildMerchantGroups(
    order: OrderTimeline,
    locale: AppLocale,
    t: WebTranslate,
): TrackingGroup[] {
    const events: { key: string; label: string; at: string; text: string }[] = [
        {
            key: "ORDER_PLACED",
            label: t("logistics.order.placed.label"),
            at: order.createdAt,
            text: t("logistics.order.placed.text"),
        },
    ]
    if (order.shippedAt) {
        events.push({
            key: "ORDER_SHIPPED",
            label: t("logistics.order.shipped.label"),
            at: order.shippedAt,
            text: t("logistics.order.shipped.text"),
        })
    }

    return events
        .toSorted((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .map((event) => ({
            key: event.key,
            label: event.label,
            abnormal: false,
            nodes: [
                {
                    key: event.key,
                    time: formatNodeTime(event.at, locale),
                    // oxlint-disable-next-line no-null -- 领域契约：节点 location 可空（string | null，商家侧事件无位置）
                    location: null,
                    text: event.text,
                    latest: false,
                    abnormal: false,
                },
            ],
        }))
}

export function buildShipmentTracks(
    shipments: ShipmentTrackingResponse[],
    locale: AppLocale,
    order: OrderTimeline | undefined,
    t: WebTranslate,
): ShipmentTrack[] {
    const merchantGroups = order ? buildMerchantGroups(order, locale, t) : []
    let merchantAttached = false

    return shipments.map((shipment) => {
        const groups = buildTrackingGroups(shipment.nodes, locale, t)
        const isPrimary = !merchantAttached && shipment.direction === "FORWARD"
        if (isPrimary) merchantAttached = true

        return {
            direction: shipment.direction,
            carrierName: shipment.carrierName,
            trackingNo: shipment.trackingNo,
            status: shipment.status,
            groups: markLatest(isPrimary ? [...groups, ...merchantGroups] : groups),
        }
    })
}
