import type { OrderDetail } from "#/order"
import type { ShipmentTrackingResponse, TrackingNodeResponse } from "@shop/api/sdk"
import type { AppLocale } from "@shop/common/i18n"
import {
    SHIPMENT_STATUS_LABEL,
    TRACKING_NODE_LABEL,
    formatNodeTime,
    isAbnormalStatus,
    markLatest,
    type ShipmentTrack,
    type TrackingGroup,
    type TrackingNode,
} from "./model"

/**
 * logistics 数据层 —— wire（生成 SDK 形状）→ 领域视图模型的投影。
 *
 * 三件事在这里做完，组件不做：
 * 1. 排序：后端按事件时刻**正序**给节点（落库顺序不是事实顺序），时间轴要新 → 旧；
 * 2. 分段：相邻同状态节点归为一段（轨迹要细、段标题要粗），段首即状态标题；
 * 3. 合成：订单侧事件（已下单/已发货）拼成同一条轴的尾部——买家要的是一条轴讲完整故事，
 *    而不是「物流一段 + 订单状态另一段」。
 */

/** 后端节点 → 轴节点（不含 latest：最新一条由 markLatest 统一判定） */
function toNode(
    node: TrackingNodeResponse,
    key: string,
    abnormal: boolean,
    locale: AppLocale,
): TrackingNode {
    return {
        key,
        time: formatNodeTime(node.occurredAt, locale),
        location: node.location,
        text: node.description?.trim() || TRACKING_NODE_LABEL[node.nodeCode],
        latest: false,
        abnormal,
    }
}

/**
 * 包裹轨迹节点（后端正序）→ 分段视图（新 → 旧）。
 *
 * 分段规则：**相邻**节点 status 相同即同段。所以段数取决于轨迹本身，
 * 分段标识带下标——同一状态可能被别的状态打断后再次出现（派送中 → 异常 → 派送中），
 * 只拿 status 当 key 会撞。
 */
export function buildTrackingGroups(
    nodes: TrackingNodeResponse[],
    locale: AppLocale,
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
            label: SHIPMENT_STATUS_LABEL[group.status],
            abnormal,
            nodes: group.nodes.map((node, i) => toNode(node, `${index}-${i}`, abnormal, locale)),
        }
    })
}

/** 订单侧时间线输入：只用下单/发货两个时刻，不依赖订单详情全貌（跨域不背 30 个字段） */
type OrderTimeline = Pick<OrderDetail, "createdAt" | "shippedAt">

/**
 * 订单侧事件 → 段（新 → 旧）。
 *
 * 只合成**有事实依据**的节点：下单时刻、发货时刻。
 * 淘宝那条轴上的「仓库处理中 / 打印完成」我们没有数据源——不造假节点，
 * 宁可少两条也不让买家看见一句我们编的话。
 */
export function buildMerchantGroups(order: OrderTimeline, locale: AppLocale): TrackingGroup[] {
    const events: { key: string; label: string; at: string; text: string }[] = [
        { key: "ORDER_PLACED", label: "已下单", at: order.createdAt, text: "商品已经下单" },
    ]
    if (order.shippedAt) {
        events.push({
            key: "ORDER_SHIPPED",
            label: "已发货",
            at: order.shippedAt,
            text: "包裹正在等待揽收",
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

/**
 * 订单级投影：每个包裹一条轴。
 *
 * 商家侧事件只并进**首个正向包裹**的轴尾——它们属于订单，不属于某个包裹；
 * 多包裹时每条轴都挂一遍就是把「已下单」重复讲了三遍。
 * `order` 未到（详情还在路上）时不合成，先只画包裹事实。
 */
export function buildShipmentTracks(
    shipments: ShipmentTrackingResponse[],
    locale: AppLocale,
    order?: OrderTimeline,
): ShipmentTrack[] {
    const merchantGroups = order ? buildMerchantGroups(order, locale) : []
    let merchantAttached = false

    return shipments.map((shipment) => {
        const groups = buildTrackingGroups(shipment.nodes, locale)
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
