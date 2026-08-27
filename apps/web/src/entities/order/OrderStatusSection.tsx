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
    pending_review: [
        { key: "review", label: "去评价", variant: "default" },
        { key: "rebuy", label: "再买一单" },
    ],
    completed: [
        { key: "rebuy", label: "再买一单", variant: "default" },
        { key: "add_cart", label: "加入购物车" },
        { key: "invoice", label: "申请开票" },
        { key: "delete", label: "删除订单" },
    ],
    cancelled: [
        { key: "rebuy", label: "再买一单", variant: "default" },
        { key: "delete", label: "删除订单" },
    ],
    refunding: [{ key: "view_refund", label: "查看退款", variant: "default" }],
}

export interface OrderStatusSectionProps {
    order: OrderDetail
    onAction?: (order: OrderDetail, action: string) => void
}

export function OrderStatusSection({ order, onAction }: OrderStatusSectionProps) {
    const actions = STATUS_ACTIONS[order.status]
    const receiver = order.receiver

    return (
        <div className="space-y-5">
            {/* 状态大标题 */}
            <h2 className="text-2xl font-bold text-foreground">
                {ORDER_STATUS_LABEL[order.status]}
            </h2>

            {/* 收货地址：列表接口可能不带 receiver，详情页才有；缺失则隐藏 */}
            {receiver && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0 text-foreground" />
                    <span>{receiver.address}</span>
                    <span>{receiver.name}</span>
                    <span>{receiver.phone}</span>
                </div>
            )}

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
