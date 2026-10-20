import { CreateShopRequestSchema } from "@shop/api/schemas"
import { CreateSubaccountRequestSchema } from "@shop/api/schemas"
import { PermissionCodes } from "@shop/common/contract"
import type { ShopResponse, SubaccountStatus } from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"

/** 本域展示词表（纯数据）：店铺/子账号的状态徽章、权限标签与上限。表单契约在 shop-form.ts / subaccount-form.ts，退货运单行的判定在 rules 槽位 */

// 镜像契约 CreateShopRequest.name 的 maxLength，不另写字面量（入口与列宽的相等由后端 FieldRuleVocabularyTest 核对）
export const SHOP_NAME_MAX = CreateShopRequestSchema.properties.name.maxLength

// 镜像契约 CreateSubaccountRequest.loginName 的列宽；与自身 schema 同源，别另写字面量
export const SUBACCOUNT_LOGIN_NAME_MAX =
    CreateSubaccountRequestSchema.properties.loginName.maxLength

type ShopStatusKey = Extract<SellerMessageKey, `shop.status.${string}`>

export const SHOP_STATUS_META: Record<
    ShopResponse["status"],
    { labelKey: ShopStatusKey; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
    PENDING_REVIEW: { labelKey: "shop.status.PENDING_REVIEW", variant: "secondary" },
    ACTIVE: { labelKey: "shop.status.ACTIVE", variant: "default" },
    REJECTED: { labelKey: "shop.status.REJECTED", variant: "destructive" },
    DISABLED: { labelKey: "shop.status.DISABLED", variant: "outline" },
}

// 权限白名单与后端 ShopService 逐字对齐：多/少一条都不会编译报错，只会静默生效不了或谎报能力
export const SUBACCOUNT_PERMISSIONS = [
    PermissionCodes.PRODUCT_MANAGE,
    PermissionCodes.ORDER_FULFILL,
    PermissionCodes.ADDRESS_MANAGE,
    PermissionCodes.SHIPPING_MANAGE,
    PermissionCodes.COUPON_MANAGE,
] as const

export type SubaccountPermission = (typeof SUBACCOUNT_PERMISSIONS)[number]

// 键类型从这张表的值推，别用前缀 Extract<>——那会混进带参数的同前缀 key，逼 t() 多传参
export const SUBACCOUNT_PERMISSION_LABEL = {
    [PermissionCodes.PRODUCT_MANAGE]: "shop.subaccount.permission.PRODUCT_MANAGE",
    [PermissionCodes.ORDER_FULFILL]: "shop.subaccount.permission.ORDER_FULFILL",
    [PermissionCodes.ADDRESS_MANAGE]: "shop.subaccount.permission.ADDRESS_MANAGE",
    [PermissionCodes.SHIPPING_MANAGE]: "shop.subaccount.permission.SHIPPING_MANAGE",
    [PermissionCodes.COUPON_MANAGE]: "shop.subaccount.permission.COUPON_MANAGE",
} as const satisfies Record<SubaccountPermission, SellerMessageKey>

export type SubaccountPermissionKey =
    (typeof SUBACCOUNT_PERMISSION_LABEL)[keyof typeof SUBACCOUNT_PERMISSION_LABEL]

export const SUBACCOUNT_STATUS_META: Record<
    SubaccountStatus,
    {
        labelKey: Extract<SellerMessageKey, `shop.subaccount.status.${string}`>
        variant: "secondary" | "default" | "destructive" | "outline"
    }
> = {
    PENDING_ACTIVATION: {
        labelKey: "shop.subaccount.status.PENDING_ACTIVATION",
        variant: "secondary",
    },
    ACTIVE: { labelKey: "shop.subaccount.status.ACTIVE", variant: "default" },
    DISABLED: { labelKey: "shop.subaccount.status.DISABLED", variant: "outline" },
}
