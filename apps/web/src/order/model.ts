import type { Money, OrderDetailResponse } from "@shop/api/sdk"

import { ORDER_ACTION_ORDER, ORDER_PRIMARY_ACTION, ORDER_UI_ACTIONS } from "./constants"

import type { AfterSaleBadge, MainProgress, OrderStatus } from "./order-status"

export type { AfterSaleBadge, MainProgress, OrderStatus } from "./order-status"

export type OrderItem = {
    orderItemId: string
    productId: string
    skuId: string
    title: string
    image?: string
    price: Money
    originalPrice?: Money
    quantity: number
    /** 当前有效发货量：买 5 件发了 3 件时给「已发 3/5」 */
    shippedQuantity: number
    /** 累计已退数量：给「已退 2 件」 */
    refundedQuantity: number
    amount: Money
}

/** 卡片里的一个店铺段 = 一张子订单（一次多店结算会拆出多个） */
export type TradeOrder = {
    id: string
    orderNo: string
    shopId: string
    shopName: string | null
    status: OrderStatus
    items: OrderItem[]
    availableActions: OrderAction[]
    payAmount: Money
    shipExpireAt: string | null
}

/**
 * 列表卡片 = 一张主订单（一次结算）。
 *
 * <p>`mainProgress` 是后端算好的主进度（§5.3），前端不重现那七条规则——它是「买家现在该等什么」的唯一口径；
 * 子订单状态只用来渲染各店铺段自己的履约位置。
 */
export type Trade = {
    id: string
    tradeNo: string
    createdAt: string
    mainProgress: MainProgress
    /** 主订单级售后角标（§5.4），与主进度叠加展示 */
    afterSaleBadge: AfterSaleBadge
    payExpireAt: string
    payAmount: Money
    orders: TradeOrder[]
}

/** 详情页仍是子订单粒度（售后、物流、评价都挂在子订单上） */
export type OrderDetail = Omit<
    OrderDetailResponse,
    "status" | "items" | "availableActions" | "afterSaleBadge"
> & {
    status: OrderStatus
    items: OrderItem[]
    availableActions: OrderAction[]
    afterSaleBadge: AfterSaleBadge
}

export function isShipOverdue(
    order: Pick<TradeOrder, "shipExpireAt">,
    now: number = Date.now(),
): boolean {
    return order.shipExpireAt !== null && new Date(order.shipExpireAt).getTime() < now
}

export function orderTotalQuantity(items: readonly Pick<OrderItem, "quantity">[]): number {
    return items.reduce((sum, item) => sum + item.quantity, 0)
}

export function orderItemKey(item: Pick<OrderItem, "productId" | "skuId" | "quantity">): string {
    return `${item.productId}-${item.skuId}-${item.quantity}`
}

export function receiverFullAddress(
    order: Pick<
        OrderDetail,
        "receiverProvince" | "receiverCity" | "receiverDistrict" | "receiverDetail"
    >,
): string {
    return (
        order.receiverProvince + order.receiverCity + order.receiverDistrict + order.receiverDetail
    )
}

export type OrderAction =
    | "pay"
    | "cancel"
    | "confirm"
    | "ship"
    | "rebuy"
    | "add_cart"
    | "logistics"
    | "extend_receive"

export type OrderActionSurface = "card" | "detail"

/** 商品行级操作：与订单级 {@link OrderAction} 分开建模——"add_cart" 在两处同字不同义 */
export type OrderItemAction = "add_cart" | "after_sale"

export interface OrderActionItem {
    key: OrderAction
    variant?: "default" | "outline"
}

export function deriveOrderActions(
    order: Pick<TradeOrder, "status" | "availableActions"> &
        Partial<Pick<OrderDetail, "canExtendReceive">>,
    surface: OrderActionSurface,
): OrderActionItem[] {
    const wanted = new Set<OrderAction>([
        ...order.availableActions,
        ...(ORDER_UI_ACTIONS[surface][order.status] ?? []),
        ...(order.canExtendReceive ? (["extend_receive"] as const) : []),
    ])
    const primary = ORDER_PRIMARY_ACTION[surface][order.status]
    return ORDER_ACTION_ORDER.filter((key) => wanted.has(key)).map((key) => ({
        key,
        variant: key === primary ? "default" : undefined,
    }))
}

/** 主订单级的动作只有付款：其余动作都挂在某张子订单上（见 {@link deriveOrderActions}） */
export function canPay(mainProgress: MainProgress): boolean {
    return mainProgress === "pending_payment"
}
