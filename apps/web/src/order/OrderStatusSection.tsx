import { MapPin } from "lucide-react"

import { Button } from "@shop/ui-web"

import { ORDER_STATUS_LABEL, type OrderDetail, type OrderStatus } from "./model"

/**
 * 订单状态区：状态大标题 + 收货地址 + 操作按钮排。
 *
 * 操作按钮按状态动态渲染（主操作橙、其余描边）。纯展示，回调交给外部。
 */

/** 按状态给出主/次操作（与列表卡片同源思路，详情页按钮更多） */
const STATUS_ACTIONS: Record<
    OrderStatus,
    { key: string; label: string; variant?: "default" | "outline" }[]
> = {
    pending_payment: [
        { key: "pay", label: "去付款", variant: "default" },
        { key: "cancel", label: "取消订单" },
    ],
    pending_shipment: [{ key: "remind", label: "提醒发货" }],
    pending_receipt: [
        { key: "logistics", label: "查看物流" },
        { key: "confirm", label: "确认收货", variant: "default" },
    ],
    completed: [
        { key: "rebuy", label: "再买一单", variant: "default" },
        { key: "add_cart", label: "加入购物车" },
    ],
    cancelled: [{ key: "rebuy", label: "再买一单" }],
}

export interface OrderStatusSectionProps {
    order: OrderDetail
    onAction?: (order: OrderDetail, action: string) => void
}

export function OrderStatusSection({ order, onAction }: OrderStatusSectionProps) {
    const actions = STATUS_ACTIONS[order.status]
    const fullAddress = [
        order.receiverProvince,
        order.receiverCity,
        order.receiverDistrict,
        order.receiverDetail,
    ]
        .filter(Boolean)
        .join("")

    return (
        <div className="space-y-5">
            {/* 状态大标题 */}
            <h2 className="text-2xl font-bold text-foreground">
                {ORDER_STATUS_LABEL[order.status]}
            </h2>

            {/* 收货地址（下单定格快照） */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0 text-foreground" />
                <span>{fullAddress}</span>
                <span>{order.receiverName}</span>
                <span>{order.receiverPhone}</span>
            </div>

            {/* 操作按钮排 */}
            <div className="flex flex-wrap gap-3">
                {actions.map((a) => (
                    <Button
                        key={a.key}
                        variant={a.variant ?? "outline"}
                        size="sm"
                        className="min-w-24"
                        onClick={() => onAction?.(order, a.key)}
                    >
                        {a.label}
                    </Button>
                ))}
            </div>
        </div>
    )
}
