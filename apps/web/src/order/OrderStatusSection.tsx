import { MapPin } from "lucide-react"

import { ORDER_STATUS_LABEL, type OrderDetail } from "./model"
import { ORDER_DETAIL_ACTIONS, OrderActionButtons, type OrderAction } from "./OrderActionButtons"
import { formatCountdown, useCountdown } from "#/shared/lib/use-countdown"

/**
 * 订单状态区：状态大标题 + 收货地址 + 操作按钮排。
 *
 * 操作按钮按状态动态渲染（主操作橙、其余描边）。纯展示，回调交给外部。
 */

export interface OrderStatusSectionProps {
    order: OrderDetail
    onAction?: (order: OrderDetail, action: OrderAction) => void
    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    pendingAction?: OrderAction
}

export function OrderStatusSection({ order, onAction, pendingAction }: OrderStatusSectionProps) {
    // 待付款订单展示付款截止倒计时
    const pending = order.status === "pending_payment"
    const { seconds } = useCountdown(pending ? order.payExpireAt : "")
    const fullAddress =
        order.receiverProvince + order.receiverCity + order.receiverDistrict + order.receiverDetail

    return (
        <div className="space-y-5">
            {/* 状态大标题 + 待付款倒计时 */}
            <div className="flex items-end gap-4">
                <h1 className="text-xl font-bold text-foreground">
                    {ORDER_STATUS_LABEL[order.status]}
                </h1>
                {pending && (
                    <span className="pb-1 text-sm font-medium text-destructive tabular-nums">
                        付款剩余 {formatCountdown(seconds)}
                    </span>
                )}
            </div>

            {/* 收货地址（下单定格快照） */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0 text-foreground" />
                <span>{fullAddress}</span>
                <span>{order.receiverName}</span>
                <span>{order.receiverPhone}</span>
            </div>

            {/* 操作按钮排 */}
            <div className="flex flex-wrap gap-3">
                <OrderActionButtons
                    actions={ORDER_DETAIL_ACTIONS[order.status]}
                    disabledKey={pendingAction}
                    onAction={(action) => onAction?.(order, action)}
                />
            </div>
        </div>
    )
}
