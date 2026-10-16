import { Button } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { orderActionLabel } from "./order-label"
import type { OrderAction, OrderActionItem } from "./model"

export function OrderActionButtons({
    actions,
    disabledKey,
    onAction,
}: {
    actions: OrderActionItem[]
    disabledKey?: OrderAction
    onAction?: (action: OrderAction) => void
}) {
    const t = useT()
    return (
        <>
            {actions.map((a) => (
                <Button
                    key={a.key}
                    variant={a.variant ?? "outline"}
                    size="sm"
                    className="min-w-24"
                    disabled={disabledKey === a.key}
                    onClick={() => onAction?.(a.key)}
                >
                    {orderActionLabel(a.key, t)}
                </Button>
            ))}
        </>
    )
}
