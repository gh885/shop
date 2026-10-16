import { z } from "zod"

import { CreateSubaccountRequestSchema } from "@shop/api/schemas"
import type { SubaccountStatus } from "@shop/api/sdk"
import { PASSWORD_MIN, PhoneSchema } from "@shop/app-kit/auth"
import { PermissionCodes } from "@shop/common/contract"
import { withMinLength } from "@shop/common/domain"

import { message } from "#/locales/message"
import type { SellerMessageKey } from "#/locales/messages.gen"

const LOGIN_NAME = CreateSubaccountRequestSchema.properties.loginName

// 取带 pattern 的那一格（CreateSubaccountRequest.loginName）给登录/激活/新建三处共用，只留一份规则
export const SubaccountLoginNameSchema = z
    .string()
    .min(LOGIN_NAME.minLength, message("login.subaccount.loginNameRule"))
    .max(LOGIN_NAME.maxLength, message("login.subaccount.loginNameRule"))
    .regex(new RegExp(LOGIN_NAME.pattern), message("login.subaccount.loginNameRule"))

// 与自身校验同源，别另写字面量
export const SUBACCOUNT_LOGIN_NAME_MAX = LOGIN_NAME.maxLength

// 走 withMinLength 而非 .min()：.min() 那条 check 会把 {min} 参数丢掉
export const SubaccountPasswordSchema = withMinLength(
    z.string(),
    PASSWORD_MIN,
    message("login.err.passwordMin", { min: PASSWORD_MIN }),
)

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

// 认不出的码返回 undefined、调用方退回显示码本身：不吞，静默丢一格权限等于谎报这人能干什么
export function subaccountPermissionLabel(code: string): SubaccountPermissionKey | undefined {
    return Object.hasOwn(SUBACCOUNT_PERMISSION_LABEL, code)
        ? SUBACCOUNT_PERMISSION_LABEL[code as SubaccountPermission]
        : undefined
}

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

export const CreateSubaccountFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    phone: PhoneSchema,
    password: SubaccountPasswordSchema,
})

export const ResetSubaccountPasswordFormSchema = z.object({
    password: SubaccountPasswordSchema,
})
