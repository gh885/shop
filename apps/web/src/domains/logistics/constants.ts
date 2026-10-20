import type { WebMessageKey } from "#/locales/messages.gen"
import type { ShipmentStatus, TrackingNodeCode, TrackingStage } from "@shop/api/sdk"

/** 本域展示词表（纯数据）：状态/阶段/节点 → 文案 key。出文案的函数在 display.ts，判定逻辑在 rules.ts，wire→视图在 mapper.ts */

type WebLogisticsStatusKey = Extract<WebMessageKey, `logistics.status.${string}`>
type WebLogisticsStageKey = Extract<WebMessageKey, `logistics.stage.${string}`>
type WebLogisticsNodeKey = Extract<WebMessageKey, `logistics.node.${string}`>

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

/** 轨迹阶段：时间线按它分组的标题，只服务于展示 */
export const TRACKING_STAGE_KEY: Record<TrackingStage, WebLogisticsStageKey> = {
    PICKED_UP: "logistics.stage.PICKED_UP",
    IN_TRANSIT: "logistics.stage.IN_TRANSIT",
    DELIVERING: "logistics.stage.DELIVERING",
    DELIVERED: "logistics.stage.DELIVERED",
    RETURNED: "logistics.stage.RETURNED",
    EXCEPTION: "logistics.stage.EXCEPTION",
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
