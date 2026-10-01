import { PermissionCodes } from "@shop/common/contract"
import { statusOptions } from "@shop/common/domain" /** 店铺治理页的权限码：后端 `SHOP_GOVERNANCE`（封店/解封与审核同权，同一批平台人） */
export const SHOP_GOVERNANCE_PERMISSION = PermissionCodes.SHOP_GOVERNANCE

/** 店铺状态 → 徽章（口径同后端 `shop.model.ShopStatus`） */
export const SHOP_STATUS_META = {
    PENDING_REVIEW: { label: "待审核", variant: "warning" },
    ACTIVE: { label: "营业中", variant: "success" },
    REJECTED: { label: "审核驳回", variant: "secondary" },
    DISABLED: { label: "已封停", variant: "destructive-subtle" },
} as const satisfies Record<
    string,
    { label: string; variant: "warning" | "success" | "secondary" | "destructive-subtle" }
>

export const SHOP_STATUS_OPTIONS = statusOptions(SHOP_STATUS_META)

/**
 * 筛选入参长度上限，与后端 `shop.dto.ShopFieldRules.NAME_MAX`（店名 50，即关键字按店名那一档）同值；
 * 状态筛选那一格与 `shop.model.ShopStatus` 的枚举名等宽（32 是库里 status 列的宽度）。
 */
export const SHOP_KEYWORD_MAX = 50
export const SHOP_STATUS_MAX = 32

export const SHOP_OPS_PAGE_SIZE = 20
