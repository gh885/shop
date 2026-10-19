import { Button } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { orderActionLabel } from "./order-label"
import type { OrderActionItem } from "./display"
import type { OrderAction } from "./rules"

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
                    variant={a.variant}
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
