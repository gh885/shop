import { z } from "zod"

/** 登录表单的字段级校验（与后端契约一致，见 @shop/api/schemas/auth） */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const PhoneSchema = z.string().regex(PHONE_PATTERN, "请输入正确的手机号")

export const SmsFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string().length(6, "请输入 6 位验证码"),
    password: z.string(),
})

export const PasswordFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string(),
    password: z.string().min(8, "密码至少 8 位"),
})
