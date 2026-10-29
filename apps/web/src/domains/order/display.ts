import type { MainProgress, OrderAction, OrderActionSurface } from "./rules"
import { ORDER_ACTION_VARIANT, ORDER_PRIMARY_ACTION } from "./constants"

/** 本域展示函数的出口（display 槽位）：把业务层给的动作 key 序列展开成带按钮外观的视图项。顺序与「有哪些动作」的判定在 rules.ts（deriveOrderActions），纯词表在 constants.ts */

export interface OrderActionItem {
    key: OrderAction
    variant: "default" | "outline"
}

/**
 * key 序列 → 视图项：命中当前状态主操作的那一个给实心（primary），其余一律描边（secondary）。
 */
export function toOrderActionItems(
    keys: readonly OrderAction[],
    status: MainProgress,
    surface: OrderActionSurface,
): OrderActionItem[] {
    const primary = ORDER_PRIMARY_ACTION[surface][status]
    return keys.map((key) => ({
        key,
        variant: ORDER_ACTION_VARIANT[key === primary ? "primary" : "secondary"],
    }))
}
