import { AdminShopQuerySchema } from "@shop/api/schemas"
import { ShopStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import { z } from "zod"
import type { AdminMessageKey } from "#/locales/messages.gen"

/** 店铺治理页的权限码：后端 `SHOP_GOVERNANCE`（封店/解封与审核同权，同一批平台人） */
export const SHOP_GOVERNANCE_PERMISSION = PermissionCodes.SHOP_GOVERNANCE

/**
 * 状态筛选的合法取值：契约 `ShopStatus` 是唯一出处。
 *
 * 此前这里是 `z.string().max(32)`，那个 32 只在测试里与审计的 `TARGET_TYPE_MAX` 绑在一起核对——
 * 两个无关概念因为「恰好都是 32」被焊住：改审计规则会要求店铺筛选跟着改，而店铺枚举真变了它未必发现。
 * 换成枚举后长度上限这一格消失，合法性直接由契约枚举给（同 `apps/admin/src/account/constants.ts` 的 `z.enum(UserStatus)`）。
 */
export const ShopStatusSchema = z.enum(ShopStatus)

type StatusKey = Extract<AdminMessageKey, `admin.shopOps.status.${string}`>

/** 店铺状态 → 徽章（口径同后端 `shop.model.ShopStatus`）；句子在 catalog。 */
export const SHOP_STATUS_META = {
    PENDING_REVIEW: { labelKey: "admin.shopOps.status.PENDING_REVIEW", variant: "warning" },
    ACTIVE: { labelKey: "admin.shopOps.status.ACTIVE", variant: "success" },
    REJECTED: { labelKey: "admin.shopOps.status.REJECTED", variant: "secondary" },
    DISABLED: { labelKey: "admin.shopOps.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    ShopStatus,
    { labelKey: StatusKey; variant: "warning" | "success" | "secondary" | "destructive-subtle" }
>

/** 状态筛选项：出 labelKey，渲染点由本端 `t` 换。 */
export const SHOP_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<ShopStatus, StatusKey>> =
    statusOptionsFromKeys(SHOP_STATUS_META)

/** 关键字筛选入参长度上限，与后端 `shop.dto.ShopFieldRules.NAME_MAX`（店名 50，即关键字按店名那一档）同值 */
export const SHOP_KEYWORD_MAX = AdminShopQuerySchema.properties.keyword.maxLength

export const SHOP_OPS_PAGE_SIZE = 20
