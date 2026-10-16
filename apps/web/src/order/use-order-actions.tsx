import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { notify } from "@shop/app-kit/data"
import { confirm } from "@shop/ui-web"

import { CancelOrderDialog } from "./CancelOrderDialog"
import type { Order, OrderAction } from "./model"
import { useCancelOrder, useExtendReceive, useReceiveOrder } from "./queries"

export function useOrderActions() {
    const navigate = useNavigate()
    const t = useT()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()
    const extend = useExtendReceive()
    const [cancelTarget, setCancelTarget] = useState<Order>()

    const handleAction = (order: Order, action: OrderAction) => {
        switch (action) {
            case "pay":
                void navigate({ to: "/pay/$orderId", params: { orderId: order.id } })
                break
            case "cancel":
                setCancelTarget(order)
                break
            case "confirm":
                receive.mutate(order.id)
                break
            case "extend_receive":
                void confirm({
                    title: t("order.extend.title"),
                    description: t("order.extend.description"),
                    confirmText: t("order.extend.confirmText"),
                    action: () => extend.mutateAsync(order.id),
                })
                break
            case "logistics":
                void navigate({ to: "/logistics/$orderId", params: { orderId: order.id } })
                break
            default:
                notify.info(message("order.soon.action", { action }))
                break
        }
    }

    const cancelDialog = (
        <CancelOrderDialog
            order={cancelTarget}
            onOpenChange={(open) => {
                if (!open) setCancelTarget(undefined)
            }}
            pending={cancel.isPending}
            onConfirm={async (reason) => {
                if (!cancelTarget) return
                await cancel.mutateAsync({ orderId: cancelTarget.id, reason })
                setCancelTarget(undefined)
            }}
        />
    )

    const pendingAction: OrderAction | undefined = extend.isPending
        ? "extend_receive"
        : cancel.isPending
          ? "cancel"
          : receive.isPending
            ? "confirm"
            : undefined

    return { handleAction, pendingAction, cancelDialog }
}
