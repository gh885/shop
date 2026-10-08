import { MapPin } from "lucide-react"

import { useT } from "#/locales/use-t"

import { orderStatusLabel } from "./order-label"
import {
    deriveOrderActions,
    receiverFullAddress,
    type OrderAction,
    type OrderDetail,
} from "./model"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"

/**
 * 订单状态区：状态大标题 + 收货地址 + 操作按钮排。
 *
 * 操作按钮按状态动态渲染（主操作橙、其余描边）。纯展示，回调交给外部。
 */

export interface OrderStatusSectionProps {
    /** 本区渲染所需：状态 + 可执行动作 + 付款截止 + 收货截止与延长资格 + 收货快照
     *  （详情契约独有，列表形状没有） */
    order: Pick<
        OrderDetail,
        | "status"
        | "availableActions"
        | "payExpireAt"
        | "receiveExpireAt"
        | "canExtendReceive"
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
    const t = useT()
    // 待付款订单展示付款截止倒计时
    const pending = order.status === "pending_payment"
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")
    // 待收货订单展示自动确认倒计时（ORD-28）；延长后后端会把 receiveExpireAt 推后，这里自然跟着变
    const receiving = order.status === "pending_receipt"
    const { seconds: receiveSeconds } = useDeadline(receiving ? (order.receiveExpireAt ?? "") : "")
    const fullAddress = receiverFullAddress(order)

    return (
        <div className="space-y-5">
            {/* 状态大标题 + 两个倒计时 */}
            <div className="flex flex-wrap items-end gap-4">
                <h1 className="text-xl font-bold text-foreground">
                    {orderStatusLabel(order.status, t)}
                </h1>
                {pending && (
                    <span className="pb-1 text-sm font-medium text-destructive tabular-nums">
                        {t("order.countdown.payRemaining", { time: formatCountdown(seconds) })}
                    </span>
                )}
                {receiving && order.receiveExpireAt && (
                    <span className="pb-1 text-sm font-medium text-muted-foreground tabular-nums">
                        {t("order.countdown.autoConfirmAfter", {
                            time: formatCountdown(receiveSeconds),
                        })}
                    </span>
                )}
            </div>

            {/* 收货地址（下单定格快照） */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
