import { z } from "zod"

import { SubaccountSmsCodeRequestSchema } from "@shop/api/schemas"
import { PhoneSchema, SmsCodeSchema } from "@shop/app-kit/auth"

import { SubaccountLoginNameSchema, SubaccountPasswordSchema } from "#/shop"

const CAPTCHA_CODE = SubaccountSmsCodeRequestSchema.properties.captchaCode

// 两套 schema 共用同一组字段形状：非当前步骤的字段也要原样透传，否则切步骤会丢掉已填的值
export const SubaccountLoginFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    password: SubaccountPasswordSchema,
    phone: z.string(),
    code: z.string(),
    captchaCode: z.string(),
})

export const SubaccountActivateFormSchema = z.object({
    loginName: SubaccountLoginNameSchema,
    password: z.string(),
    phone: PhoneSchema,
    code: SmsCodeSchema,
    captchaCode: z.string().min(CAPTCHA_CODE.minLength),
})

export type SubaccountStep = "login" | "activate"
