import { z } from 'zod';

// ---------- 请求 ----------

export const SmsCodeRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
});
export type SmsCodeRequest = z.infer<typeof SmsCodeRequestSchema>;

export const SmsLoginRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    code: z.string().length(6),
    deviceId: z.string().min(1).max(100),
});
export type SmsLoginRequest = z.infer<typeof SmsLoginRequestSchema>;

export const PasswordLoginRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    password: z.string().min(8).max(72),
    deviceId: z.string().min(1).max(100),
});
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;

export const SetPasswordRequestSchema = z.object({
    currentPassword: z.string().max(72).optional(),
    newPassword: z.string().min(8).max(72),
});
export type SetPasswordRequest = z.infer<typeof SetPasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
    phone: z.string().min(7).max(20).trim(),
    token: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(72),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const RefreshRequestSchema = z.object({
    refreshToken: z.string().max(200).optional(),
    deviceId: z.string().max(100).optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({
    deviceId: z.string().min(1).max(100),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

// ---------- 响应 ----------

export const TokenResultSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
});
export type TokenResult = z.infer<typeof TokenResultSchema>;

export const MeResponseSchema = z.object({
    id: z.number(),
    phone: z.string(),
    nickname: z.string().nullable(),
    avatarKey: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
