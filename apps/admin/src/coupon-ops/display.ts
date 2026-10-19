import {
    OPS_LABEL_BY_KEY,
    OPS_VARIANT_BY_KEY,
    type CouponStatusKey,
    type OpsBadgeVariant,
} from "./constants"

/** 槽位：本域消费词表出文案的函数（status → label key + 徽章 variant）。纯数据表在 constants.ts，消费在 columns.tsx */

export function couponOpsStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: OpsBadgeVariant
} {
    return { labelKey: OPS_LABEL_BY_KEY[status], variant: OPS_VARIANT_BY_KEY[status] ?? "outline" }
}
