import { CouponType } from "@shop/api/sdk"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { SellerMessageKey } from "#/locales/messages.gen"

import type { CouponStatus } from "./rules"

/** 本域展示词表（纯数据）：活动状态/券类型 → 文案 key 与徽章外观。判定逻辑在 rules.ts，行形状在 mapper.ts，表单契约在 form.ts */

type CouponStatusLabelKey = Extract<SellerMessageKey, `coupon.status.${string}`>

// 别和买家券包的 COUPON_STATUS_META「对齐」成一张表：那张说券在买家包的处境，这张说活动跑到哪一段，两套词两个主语
export const TEMPLATE_STATUS_META: Record<
    CouponStatus,
    { labelKey: CouponStatusLabelKey; variant: "success" | "secondary" | "outline" }
> = {
    NOT_STARTED: { labelKey: "coupon.status.NOT_STARTED", variant: "outline" },
    ONGOING: { labelKey: "coupon.status.ONGOING", variant: "success" },
    ENDED: { labelKey: "coupon.status.ENDED", variant: "secondary" },
    // 停用是正常收场不是危险动作：destructive 色按 DESIGN.md 只给破坏性动作，别把徽章「顺手」改成危险色
    STOPPED: { labelKey: "coupon.status.STOPPED", variant: "outline" },
}

type CouponTypeKey = Extract<SellerMessageKey, `coupon.type.${string}`>

const COUPON_TYPE_KEYS = {
    FULL_REDUCTION: "coupon.type.FULL_REDUCTION",
    DISCOUNT: "coupon.type.DISCOUNT",
} as const satisfies Record<CouponType, CouponTypeKey>

export const COUPON_TYPE_ITEMS: ReadonlyArray<KeyedStatusOption<CouponType, CouponTypeKey>> =
    statusOptionsFromKeys(COUPON_TYPE_KEYS)
