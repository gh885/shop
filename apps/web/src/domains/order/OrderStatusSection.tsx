import { MapPin } from "lucide-react"

import { useT } from "#/locales/use-t"

import { orderStatusLabel } from "./order-label"
import {
    deriveOrderActions,
    receiverFullAddress,
    type OrderAction,
    type OrderDetail,
} from "./rules"
import { toOrderActionItems } from "./display"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"

export interface OrderStatusSectionProps {
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
    onAction?: (action: OrderAction) => void
    pendingAction?: OrderAction
}

export function OrderStatusSection({ order, onAction, pendingAction }: OrderStatusSectionProps) {
    const t = useT()
    const pending = order.status === "pending_payment"
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")
    const receiving = order.status === "pending_receipt"
    const { seconds: receiveSeconds } = useDeadline(receiving ? (order.receiveExpireAt ?? "") : "")
    const fullAddress = receiverFullAddress(order)

    return (
        <div className="space-y-5">
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

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0 text-foreground" />
                <span>{fullAddress}</span>
                <span>{order.receiverName}</span>
                <span>{order.receiverPhone}</span>
            </div>

            <div className="flex flex-wrap gap-3">
                <OrderActionButtons
                    actions={toOrderActionItems(
                        deriveOrderActions(order, "detail"),
                        order.status,
                        "detail",
                    )}
                    disabledKey={pendingAction}
                    onAction={onAction}
                />
            </div>
        </div>
    )
}
