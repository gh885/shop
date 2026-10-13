import { z } from "zod"

import { SubaccountSmsCodeRequestSchema } from "@shop/api/schemas"
import { PhoneSchema, SmsCodeSchema } from "@shop/app-kit/auth"

import { SubaccountLoginNameSchema, SubaccountPasswordSchema } from "#/shop"

/**
 * 子账号**登录 / 激活**两张表单的字段规则 —— 住在 seller 端，因为「子账号登录」只在这里存在。
 *
 * 登录名与口令的形状不在这里定义：它们的 owner 是 shop 域的 `subaccount.ts`（经 `#/shop` 桶的
 * 公开入口取），本文件只负责「哪张表单校验哪几格」。管理页新建子账号用的是同一份登录名/口令规则。
 */

/**
 * 激活发码那一格的人机验证：图形码字符数的 owner 是 app-kit 的 `CAPTCHA_CODE_DIGITS`
 * （用在输入框 maxLength 与提交前的完整性判定），这里只要求非空。
 */
const CAPTCHA_CODE = SubaccountSmsCodeRequestSchema.properties.captchaCode

/**
 * 两张表单共用一套值形状（非当前步骤的字段原样透传、不校验）。
 * 与 `LoginForm` 的短信/密码双 Tab 同一种做法：切步骤只换 schema、不换 form 实例，
 * 已填的登录名因此不会在切到激活步骤时丢掉。
 */
export const SubaccountLoginFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    password: SubaccountPasswordSchema,
    phone: z.string(),
    code: z.string(),
    captchaCode: z.string(),
})

/** 激活步骤：登录名 + 本人手机号 + 短信码 + 图形码（口令那一格不参与，激活不发口令） */
export const SubaccountActivateFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    password: z.string(),
    phone: PhoneSchema,
    code: SmsCodeSchema,
    captchaCode: z.string().min(CAPTCHA_CODE.minLength),
})

export type SubaccountStep = "login" | "activate"
