import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { notify } from "@shop/app-kit/data"

import { CancelOrderDialog } from "./CancelOrderDialog"
import type { OrderAction } from "./rules"
import { useCancelOrder, useReceiveOrder } from "./queries"

/**
 * 动作的作用对象：`sellerOrderId` 决定收货打哪张子单，`orderGroupId` 决定取消 / 付款打哪个组。
 */
export type OrderActionTarget = {
    orderGroupId: string
    orderNo: string
    /** 收货动作需要子单 id；组级动作（付款/取消）不需要 */
    sellerOrderId?: string
}

export function useOrderActions() {
    const navigate = useNavigate()
    const t = useT()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()
    const [cancelTarget, setCancelTarget] = useState<{ id: string; orderNo: string }>()

    const handleAction = (order: OrderActionTarget, action: OrderAction) => {
        switch (action) {
            case "pay":
                void navigate({
                    to: "/pay/$tradeId",
                    params: { tradeId: order.orderGroupId },
                })
                break
            case "cancel":
                setCancelTarget({ id: order.orderGroupId, orderNo: order.orderNo })
                break
            case "confirm":
                if (order.sellerOrderId) receive.mutate(order.sellerOrderId)
                break
            default:
                notify.info(message("order.soon.action", { action: t(`order.action.${action}`) }))
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
            onConfirm={async () => {
                if (!cancelTarget) return
                await cancel.mutateAsync(cancelTarget.id)
                setCancelTarget(undefined)
            }}
        />
    )

    const pendingAction: OrderAction | undefined = cancel.isPending
        ? "cancel"
        : receive.isPending
          ? "confirm"
          : undefined

    return { handleAction, pendingAction, cancelDialog }
}
