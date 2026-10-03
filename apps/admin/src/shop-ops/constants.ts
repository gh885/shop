import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

/** 店铺治理页的权限码：后端 `SHOP_GOVERNANCE`（封店/解封与审核同权，同一批平台人） */
export const SHOP_GOVERNANCE_PERMISSION = PermissionCodes.SHOP_GOVERNANCE

type StatusKey = Extract<AdminMessageKey, `admin.shopOps.status.${string}`>

/** 店铺状态 → 徽章（口径同后端 `shop.model.ShopStatus`）；句子在 catalog。 */
export const SHOP_STATUS_META = {
    PENDING_REVIEW: { labelKey: "admin.shopOps.status.PENDING_REVIEW", variant: "warning" },
    ACTIVE: { labelKey: "admin.shopOps.status.ACTIVE", variant: "success" },
    REJECTED: { labelKey: "admin.shopOps.status.REJECTED", variant: "secondary" },
    DISABLED: { labelKey: "admin.shopOps.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    string,
    { labelKey: StatusKey; variant: "warning" | "success" | "secondary" | "destructive-subtle" }
>

/** 状态筛选项：出 labelKey，渲染点由本端 `t` 换。 */
export const SHOP_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<string, StatusKey>> =
    statusOptionsFromKeys(SHOP_STATUS_META)

/**
 * 筛选入参长度上限，与后端 `shop.dto.ShopFieldRules.NAME_MAX`（店名 50，即关键字按店名那一档）同值；
 * 状态筛选那一格与 `shop.model.ShopStatus` 的枚举名等宽（32 是库里 status 列的宽度）。
 */
export const SHOP_KEYWORD_MAX = 50
export const SHOP_STATUS_MAX = 32

export const SHOP_OPS_PAGE_SIZE = 20
