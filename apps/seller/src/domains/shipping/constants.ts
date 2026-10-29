import type { RegionRuleFormValue } from "./form"
import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

export const FEE_TIER_FIELDS: readonly {
    key: keyof Omit<RegionRuleFormValue, "id" | "areaCodes">
    labelKey: Exclude<SellerMessageKey, keyof SellerParamsByKey>
    inputMode: "numeric" | "decimal"
}[] = [
    { key: "firstQuantity", labelKey: "shipping.tier.firstQuantity", inputMode: "numeric" },
    { key: "firstFee", labelKey: "shipping.tier.firstFee", inputMode: "decimal" },
    { key: "addQuantity", labelKey: "shipping.tier.addQuantity", inputMode: "numeric" },
    { key: "addFee", labelKey: "shipping.tier.addFee", inputMode: "decimal" },
]
