import type { Money } from "@shop/api/sdk"

import type { MainProgress, OrderStatus } from "./order-status"

export type { MainProgress, OrderStatus } from "./order-status"

/**
 * 订单行（买家视角）。
 *
 * <p>契约里一行只带 `unitAmount` / `payableAmount` 两个金额：行小计就是 `payableAmount`，
 * 单价是 `unitAmount`。发货与收货量都在行上（`shippedQty` / `receivedQty`），
 * 所以「已发 3/5」「已收 2」这类文案不需要另算。
 */
export type OrderItem = {
    lineNo: number
    skuId: string
    title: string
    image: string
    /** 规格快照，后端给的是 JSON 文本 */
    specValuesJson: string
    quantity: number
    shippedQuantity: number
    receivedQuantity: number
    price: Money
    amount: Money
}

/** 店铺段 = 一张子订单（一次多店结算会拆出多个） */
export type TradeOrder = {
    id: string
    orderNo: string
    shopId: string
    /** 履约状态：unshipped / partial_shipped / shipped / received；已关闭时看 closedReason */
    fulfillmentStatus: OrderStatus
    closedReason: string
    items: OrderItem[]
    payAmount: Money
}

/**
 * 买家订单组（一次结算）。
 *
 * <p>组级只有支付维度（`status`），发货进度在子单上——这是后端 `DISPLAY_STATUS` 的口径，
 * 前端不重新合成一个「主进度」，否则列表标签和筛选会变成两套词。
 */
export type Trade = {
    id: string
    tradeNo: string
    createdAt: string
    status: MainProgress
    payExpireAt: string
    payAmount: Money
}

/** 详情页 = 一个订单组 + 它的子订单 */
export type OrderDetail = {
    id: string
    orderNo: string
    status: MainProgress
    payAmount: Money
    paid: Money
    /** 下单时的收货地址快照（JSON 文本），解析在展示层 */
    shippingAddressJson: string
    payExpireAt: string
    createdAt: string
    orders: TradeOrder[]
}

/** 把所有子订单的行摊平：详情页的商品区不按店铺分组渲染时用 */
export function allItems(order: OrderDetail): OrderItem[] {
    return order.orders.flatMap((o) => o.items)
}

export function orderItemKey(item: Pick<OrderItem, "skuId" | "lineNo">): string {
    return `${item.skuId}-${item.lineNo}`
}

export type ShippingAddress = {
    receiverName: string
    receiverPhone: string
    province: string
    city: string
    district: string
    detail: string
}

/** 地址快照是 JSON 文本，解析失败给空串——宁可少一行地址，也别把详情页打成白屏 */
export function parseShippingAddress(json: string): ShippingAddress {
    const empty: ShippingAddress = {
        receiverName: "",
        receiverPhone: "",
        province: "",
        city: "",
        district: "",
        detail: "",
    }
    try {
        const raw: unknown = JSON.parse(json)
        if (typeof raw !== "object" || raw === null) return empty
        // unknown → Record 只为按名探字段，值在 text() 里逐个 typeof 验
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上
        const record = raw as Record<string, unknown>
        const text = (key: string) => {
            const value = record[key]
            return typeof value === "string" ? value : ""
        }
        return {
            receiverName: text("receiverName"),
            receiverPhone: text("receiverPhone"),
            province: text("province") || text("receiverProvince"),
            city: text("city") || text("receiverCity"),
            district: text("district") || text("receiverDistrict"),
            detail: text("detail") || text("receiverDetail"),
        }
    } catch {
        return empty
    }
}

export function receiverFullAddress(address: ShippingAddress): string {
    return address.province + address.city + address.district + address.detail
}

export type OrderAction = "pay" | "cancel" | "confirm" | "rebuy" | "add_cart" | "logistics"

export type OrderActionSurface = "card" | "detail"

/** 商品行级操作：与订单级 {@link OrderAction} 分开建模——"add_cart" 在两处同字不同义 */
export type OrderItemAction = "add_cart" | "after_sale"

/**
 * 这一刻允许哪些动作。
 *
 * <p>新契约不再下发 `availableActions`：动作由组级支付态 + 子单履约态推出，规则只有这几条。
 */
export function deriveOrderActions(
    order: Pick<OrderDetail, "status">,
    surface: OrderActionSurface,
): OrderAction[] {
    const actions: OrderAction[] = []
    if (order.status === "pending_payment") {
        actions.push("pay", "cancel")
    }
    if (order.status === "paid" || order.status === "partially_refunded") {
        actions.push("logistics")
    }
    if (surface === "detail") {
        if (order.status === "paid" || order.status === "partially_refunded") {
            actions.push("confirm")
        }
        if (
            order.status === "closed" ||
            order.status === "cancelled" ||
            order.status === "refunded"
        ) {
            actions.push("rebuy", "add_cart")
        }
    }
    return actions
}

/** 组级只有付款：其余动作都挂在某张子订单上 */
export function canPay(status: MainProgress): boolean {
    return status === "pending_payment"
}
