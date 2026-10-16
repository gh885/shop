import type { Money, OrderDetailResponse } from "@shop/api/sdk"

import { ORDER_ACTION_ORDER, ORDER_PRIMARY_ACTION, ORDER_UI_ACTIONS } from "./constants"

import type { OrderStatus } from "./order-status"

export type { OrderStatus } from "./order-status"

export type OrderItem = {
    orderItemId: string
    productId: string
    skuId: string
    title: string
    image?: string
    price: Money
    originalPrice?: Money
    quantity: number
    amount: Money
}

export type Order = {
    id: string
    orderNo: string
    createdAt: string
    status: OrderStatus
    payExpireAt: string
    shipExpireAt: string | null
    shopId: string
    shopName: string | null
    items: OrderItem[]
    availableActions: OrderAction[]
    itemAmount: Money
    shippingFee?: Money
    payAmount: Money
}

export type OrderDetail = Order & Omit<OrderDetailResponse, "status" | "items" | "availableActions">

export function isShipOverdue(
    order: Pick<Order, "shipExpireAt">,
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

export interface OrderActionItem {
    key: OrderAction
    variant?: "default" | "outline"
}

export function deriveOrderActions(
    order: Pick<Order, "status" | "availableActions"> &
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
