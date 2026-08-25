import { z } from "zod"

// ---------- 请求 ----------

export const SmsCodeRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
})
export type SmsCodeRequest = z.infer<typeof SmsCodeRequestSchema>

export const SmsLoginRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    code: z.string().length(6),
    deviceId: z.string().min(1).max(100),
})
export type SmsLoginRequest = z.infer<typeof SmsLoginRequestSchema>

export const PasswordLoginRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    password: z.string().min(8).max(72),
    deviceId: z.string().min(1).max(100),
})
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>

export const SetPasswordRequestSchema = z.object({
    currentPassword: z.string().max(72).optional(),
    newPassword: z.string().min(8).max(72),
})
export type SetPasswordRequest = z.infer<typeof SetPasswordRequestSchema>

export const ForgotPasswordRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
})
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>

export const ResetPasswordRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    code: z.string().length(6),
    newPassword: z.string().min(8).max(72),
})
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>

export const RefreshRequestSchema = z.object({
    refreshToken: z.string().max(200).optional(),
    deviceId: z.string().max(100).optional(),
})
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>

export const LogoutRequestSchema = z.object({
    deviceId: z.string().min(1).max(100),
})
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>

// ---------- 响应 ----------

// refreshToken 只经 httpOnly cookie 下发，响应体不含此字段
export const TokenResultSchema = z.object({
    accessToken: z.string(),
})
export type TokenResult = z.infer<typeof TokenResultSchema>

export const MeResponseSchema = z.object({
    // 后端 MeResponse.id 是 UUID（Java UUID 序列化为字符串），曾误标 number 导致 useMe 必抛 ZodError
    id: z.uuid(),
    phone: z.string(),
    nickname: z.string().nullable(),
    avatarKey: z.string().nullable(),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

// ---------- 登录表单（客户端字段级校验，与后端契约对齐） ----------

/** 中国大陆手机号 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const PhoneSchema = z.string().regex(PHONE_PATTERN, "请输入正确的手机号")

/**
 * 短信/密码双 Tab 共用一套表单值，schema 按 Tab 切换；非当前 Tab 的字段原样透传不校验。
 * 提交时按 Tab 取对应字段（见各 app 登录页）。
 */
export const SmsFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string().length(6, "请输入 6 位验证码"),
    password: z.string(),
})

/** 密码登录表单（code 为占位字段，见上） */
export const PasswordFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string(),
    password: z.string().min(8, "密码至少 8 位"),
})
