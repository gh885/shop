import type { OrderDetail } from "#/order"
import type { WebTranslate } from "#/locales/messages.gen"
import type { ShipmentTrackingResponse, TrackingNodeResponse } from "@shop/api/sdk"
import type { AppLocale } from "@shop/i18n"
import {
    shipmentStatusLabel,
    trackingNodeLabel,
    formatNodeTime,
    isAbnormalStatus,
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

export function buildTrackingGroups(
    nodes: TrackingNodeResponse[],
    locale: AppLocale,
    t: WebTranslate,
): TrackingGroup[] {
    const ordered = nodes.toSorted(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )

    const groups: { status: ShipmentTrack["status"]; nodes: TrackingNodeResponse[] }[] = []
    for (const node of ordered) {
        const current = groups.at(-1)
        if (current && current.status === node.status) current.nodes.push(node)
        else groups.push({ status: node.status, nodes: [node] })
    }

    return groups.map((group, index) => {
        const abnormal = isAbnormalStatus(group.status)
        return {
            key: `${group.status}-${index}`,
            label: shipmentStatusLabel(group.status, t),
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
