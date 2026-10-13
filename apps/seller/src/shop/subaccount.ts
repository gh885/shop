import { z } from "zod"

import { CreateSubaccountRequestSchema } from "@shop/api/schemas"
import type { SubaccountStatus } from "@shop/api/sdk"
import { PASSWORD_MIN, PhoneSchema } from "@shop/app-kit/auth"
import { PermissionCodes } from "@shop/common/contract"
import { withMinLength } from "@shop/common/domain"

import { message } from "#/locales/message"
import type { SellerMessageKey } from "#/locales/messages.gen"

/**
 * shop 域 · 子账号：**字段规则、可授予权限码、状态展示**三条纯规则的唯一出口。
 *
 * 登录页（`#/auth/subaccount-form`）与子账号管理页（`routes/_app/shop/member.tsx`）都从这一份取数：
 * 「登录名允许多长」和「有哪五个权限码」是两个问题各只有一个答案，各写一遍就会在某次改动后分叉，
 * 而分叉的表现是「新建时能填的登录名，登录时被拒」这种两边都不报错的怪事。
 *
 * 数字一律从生成的契约里取，不在这里写第二遍。
 */

const LOGIN_NAME = CreateSubaccountRequestSchema.properties.loginName

/**
 * 登录名：形状与两端边界都取契约的 `CreateSubaccountRequest.loginName`——它是**唯一带 pattern 的那一格**
 * （`SubaccountLoginRequest.loginName` 只卡 4..50、没有字符集）。
 *
 * 取更严的那一格给「登录 / 激活 / 新建」三处共用：登录名只可能由新建产生，所以「登录时允许的字符集
 * 比新建时宽」在现实里没有对应物，而两份规则并存就一定会有人改了一边忘了另一边。
 * 句子里写死区间是因为这条 message 没有参数槽位。
 */
export const SubaccountLoginNameSchema = z
    .string()
    .min(LOGIN_NAME.minLength, message("login.subaccount.loginNameRule"))
    .max(LOGIN_NAME.maxLength, message("login.subaccount.loginNameRule"))
    .regex(new RegExp(LOGIN_NAME.pattern), message("login.subaccount.loginNameRule"))

/** 新建表单那个输入框的 `maxLength`：与它自己的校验同源，不另写一个数 */
export const SUBACCOUNT_LOGIN_NAME_MAX = LOGIN_NAME.maxLength

/**
 * 子账号口令：走 `withMinLength` 而不是 `.min()` —— 后者会把 `{min}` 参数丢掉，句子只剩裸槽位。
 * 下限复用 app-kit 的 `PASSWORD_MIN`（后端 `AccountFieldRules.PASSWORD_MIN` 的同一条规则、同一个数，
 * 子账号口令与买家口令在契约里也是同一个 8..72 档）。
 */
export const SubaccountPasswordSchema = withMinLength(
    z.string(),
    PASSWORD_MIN,
    message("login.err.passwordMin", { min: PASSWORD_MIN }),
)

/**
 * 店主可授予子账号的权限码（顺序即界面上的顺序）。
 *
 * 它必须与后端白名单逐格相同：后端 `ShopService` 只收这五个码，多给一个码的后果是
 * 「勾了保存成功、但那个权限从来没生效」——前端多一格的代价比少一格隐蔽得多。
 */
export const SUBACCOUNT_PERMISSIONS = [
    PermissionCodes.PRODUCT_MANAGE,
    PermissionCodes.ORDER_FULFILL,
    PermissionCodes.ADDRESS_MANAGE,
    PermissionCodes.SHIPPING_MANAGE,
    PermissionCodes.COUPON_MANAGE,
] as const

export type SubaccountPermission = (typeof SUBACCOUNT_PERMISSIONS)[number]

/**
 * 码 → catalog key 的单一来源（句子在 catalog，写错键即编译错，§6 枚举查表）。
 *
 * 键类型从**这张表的值**推（而不是 `Extract<SellerMessageKey, "shop.subaccount.permission.${string}">`）：
 * 后者会把 `shop.subaccount.permission.edit.title` 这类同前缀、**带参数**的 key 一起收进来，
 * 于是「用变量调 `t()`」的那处会因为联合里混进一条带槽位的消息而要求多传参数。
 */
export const SUBACCOUNT_PERMISSION_LABEL = {
    [PermissionCodes.PRODUCT_MANAGE]: "shop.subaccount.permission.PRODUCT_MANAGE",
    [PermissionCodes.ORDER_FULFILL]: "shop.subaccount.permission.ORDER_FULFILL",
    [PermissionCodes.ADDRESS_MANAGE]: "shop.subaccount.permission.ADDRESS_MANAGE",
    [PermissionCodes.SHIPPING_MANAGE]: "shop.subaccount.permission.SHIPPING_MANAGE",
    [PermissionCodes.COUPON_MANAGE]: "shop.subaccount.permission.COUPON_MANAGE",
} as const satisfies Record<SubaccountPermission, SellerMessageKey>

/** 权限标签的 catalog key 类型（上面那张表的值联合） */
export type SubaccountPermissionKey =
    (typeof SUBACCOUNT_PERMISSION_LABEL)[keyof typeof SUBACCOUNT_PERMISSION_LABEL]

/**
 * 权限码 → 标签 key。认不出的码（后端加了新码而前端还没跟）返回 undefined，
 * 调用方退回显示码本身——**不吞**：静默丢掉一格权限等于谎报这个人能干什么。
 */
export function subaccountPermissionLabel(code: string): SubaccountPermissionKey | undefined {
    return Object.hasOwn(SUBACCOUNT_PERMISSION_LABEL, code)
        ? SUBACCOUNT_PERMISSION_LABEL[code as SubaccountPermission]
        : undefined
}

/** 状态徽章：三档状态 → 文案 key + 徽章样式。写错键即编译错 */
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

/** 新建子账号：登录名 + 手机号 + 初始口令（权限勾选在表单里另给，不进校验） */
export const CreateSubaccountFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    phone: PhoneSchema,
    password: SubaccountPasswordSchema,
})

/** 重置口令：只改口令这一格（店主代替子账号设一个新的，子账号下次用它登录） */
export const ResetSubaccountPasswordFormSchema = z.object({
    password: SubaccountPasswordSchema,
})
