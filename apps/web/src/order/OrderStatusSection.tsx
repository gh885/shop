import { MapPin } from "lucide-react"

import { ORDER_STATUS_LABEL } from "./constants"
import { deriveOrderActions, type OrderAction, type OrderDetail } from "./model"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"

/**
 * 订单状态区：状态大标题 + 收货地址 + 操作按钮排。
 *
 * 操作按钮按状态动态渲染（主操作橙、其余描边）。纯展示，回调交给外部。
 */

export interface OrderStatusSectionProps {
    /** 本区渲染所需：状态 + 可执行动作 + 付款截止 + 收货快照（详情契约独有，列表形状没有） */
    order: Pick<
        OrderDetail,
        | "status"
        | "availableActions"
        | "payExpireAt"
        | "receiverName"
        | "receiverPhone"
        | "receiverProvince"
        | "receiverCity"
        | "receiverDistrict"
        | "receiverDetail"
    >
    /** 只回传动作：订单由页面持有，不绕组件一圈 */
    onAction?: (action: OrderAction) => void
    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    pendingAction?: OrderAction
}

export function OrderStatusSection({ order, onAction, pendingAction }: OrderStatusSectionProps) {
    // 待付款订单展示付款截止倒计时
    const pending = order.status === "pending_payment"
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")
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
                    actions={deriveOrderActions(order, "detail")}
                    disabledKey={pendingAction}
                    onAction={onAction}
                />
            </div>
        </div>
    )
}
