import { MapPin } from "lucide-react"

import { useT } from "#/locales/use-t"

import { mainProgressLabel } from "./order-label"
import {
    deriveOrderActions,
    parseShippingAddress,
    receiverFullAddress,
    type OrderAction,
    type OrderDetail,
} from "./rules"
import { toOrderActionItems } from "./display"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"

export interface OrderStatusSectionProps {
    order: Pick<OrderDetail, "status" | "payExpireAt" | "shippingAddressJson">
    onAction?: (action: OrderAction) => void
    pendingAction?: OrderAction
}

export function OrderStatusSection({ order, onAction, pendingAction }: OrderStatusSectionProps) {
    const t = useT()
    const pending = order.status === "pending_payment"
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")
    const address = parseShippingAddress(order.shippingAddressJson)
    const fullAddress = receiverFullAddress(address)

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-4">
                <h1 className="text-xl font-bold text-foreground">
                    {mainProgressLabel(order.status, t)}
                </h1>
                {pending && order.payExpireAt && (
                    <span className="pb-1 text-sm font-medium text-destructive tabular-nums">
                        {t("order.countdown.payRemaining", { time: formatCountdown(seconds) })}
                    </span>
                )}
            </div>

            {fullAddress && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4 shrink-0 text-foreground" />
                    <span>{fullAddress}</span>
                    <span>{address.receiverName}</span>
                    <span>{address.receiverPhone}</span>
                </div>
            )}

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
