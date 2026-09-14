import { Button } from "@shop/ui-web"

import type { OrderAction, OrderActionItem } from "./model"

/**
 * 订单操作按钮排：动作清单由调用方给（后端动作 + 前端附加动作，见 model.ts 的 deriveOrderActions），
 * 本组件只负责画按钮与禁用态。
 */

/** 操作按钮排：进行中的动作对应按钮禁用，防重复提交 */
export function OrderActionButtons({
    actions,
    disabledKey,
    onAction,
}: {
    actions: OrderActionItem[]
    /** 进行中的操作 key */
    disabledKey?: OrderAction
    onAction?: (action: OrderAction) => void
}) {
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
                    {a.label}
                </Button>
            ))}
        </>
    )
}
