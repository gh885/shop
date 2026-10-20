import type { SellerMessageKey } from "#/locales/messages.gen"

import { SKU_LABEL_SINGLE } from "./constants"

/** 本域展示函数的出口：模型值 → 文案/展示形状。纯数据在 constants.ts，判定与推导在 draft-rules.ts（rules 槽位），表单契约在 form.ts */

type SingleSpecKey = Extract<SellerMessageKey, `product.sku.singleSpec`>

// 单规格哨兵（= catalog key）交给本端 t 换当前语言；规格值是数据，原样透出
export function skuDisplayLabel(label: string, t: (key: SingleSpecKey) => string): string {
    return label === SKU_LABEL_SINGLE ? t(SKU_LABEL_SINGLE) : label
}
