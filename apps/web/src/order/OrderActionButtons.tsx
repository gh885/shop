import { Button } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { orderActionLabel } from "./order-label"
import type { OrderAction, OrderActionItem } from "./model"

/**
 * 订单操作按钮排：动作清单由调用方给（后端动作 + 前端附加动作），
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
    // 按钮文案在这里现取（动作项只带 key）：`OrderActionItem` 是纯派生结果、模块级、拿不到语言，
    // 而按钮文案是句子（i18n §4.2）
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
