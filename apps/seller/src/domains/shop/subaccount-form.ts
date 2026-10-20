import { z } from "zod"

import { CreateSubaccountRequestSchema } from "@shop/api/schemas"
import { PASSWORD_MIN, PhoneSchema } from "@shop/app-kit/auth"
import { withMinLength } from "@shop/common/domain"

import { message } from "#/locales/message"

/** 子账号表单契约（form 槽位，命名跟 shop-form.ts）：纯形状 + 校验消息。展示词表（权限/状态/上限）在 constants.ts，语言无关判定在 rules.ts，消费方经 #/shop barrel 取 */

const LOGIN_NAME = CreateSubaccountRequestSchema.properties.loginName

// 取带 pattern 的那一格（CreateSubaccountRequest.loginName）给登录/激活/新建三处共用，只留一份规则
export const SubaccountLoginNameSchema = z
    .string()
    .min(LOGIN_NAME.minLength, message("login.subaccount.loginNameRule"))
    .max(LOGIN_NAME.maxLength, message("login.subaccount.loginNameRule"))
    .regex(new RegExp(LOGIN_NAME.pattern), message("login.subaccount.loginNameRule"))

// 走 withMinLength 而非 .min()：.min() 那条 check 会把 {min} 参数丢掉
export const SubaccountPasswordSchema = withMinLength(
    z.string(),
    PASSWORD_MIN,
    message("login.err.passwordMin", { min: PASSWORD_MIN }),
)

export const CreateSubaccountFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    phone: PhoneSchema,
    password: SubaccountPasswordSchema,
})

export const ResetSubaccountPasswordFormSchema = z.object({
    password: SubaccountPasswordSchema,
})
