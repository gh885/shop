import type { CaseView } from "@shop/api/sdk"

import type { SaleDecisionKind } from "#/domains/order/after-sale-decision"
import { availableDecisions } from "#/domains/order/after-sale-decision"

/** 售后行内动作的视图出口（mapper 槽位）：售后单 → 行内可点动作。动作集由状态机裁决（rules 槽位），这里只做形状转接 */

export type RmaRowAction = SaleDecisionKind

export function rmaRowActions(rma: CaseView): RmaRowAction[] {
    return availableDecisions(rma)
}
