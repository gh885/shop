import { AdminShopQuerySchema } from "@shop/api/schemas"
import { ShopStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

export const SHOP_GOVERNANCE_PERMISSION = PermissionCodes.SHOP_GOVERNANCE

type StatusKey = Extract<AdminMessageKey, `shopOps.status.${string}`>

export const SHOP_STATUS_META = {
    PENDING_REVIEW: { labelKey: "shopOps.status.PENDING_REVIEW", variant: "warning" },
    ACTIVE: { labelKey: "shopOps.status.ACTIVE", variant: "success" },
    REJECTED: { labelKey: "shopOps.status.REJECTED", variant: "secondary" },
    DISABLED: { labelKey: "shopOps.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    ShopStatus,
    { labelKey: StatusKey; variant: "warning" | "success" | "secondary" | "destructive-subtle" }
>

export const SHOP_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<ShopStatus, StatusKey>> =
    statusOptionsFromKeys(SHOP_STATUS_META)

export const SHOP_KEYWORD_MAX = AdminShopQuerySchema.properties.keyword.maxLength

export const SHOP_OPS_PAGE_SIZE = 20
