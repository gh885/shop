import { z } from "zod"

/**
 * Web + Seller 两个 app 共用的登录/表单字段级校验规则。
 * 与后端契约对齐的格式规则（手机号、密码长度）集中一处，改一处全局同步；
 * 单 app 专属的表单校验就近放在对应功能模块（不要放这里）。
 */

/** 中国大陆手机号 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const PhoneSchema = z.string().regex(PHONE_PATTERN, "请输入正确的手机号")

/**
 * 短信/密码双 Tab 共用一套表单值，schema 按 Tab 切换；非当前 Tab 的字段原样透传不校验。
 * 提交时按 Tab 取对应字段。
 */
export const SmsFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string().length(6, "请输入 6 位验证码"),
    password: z.string(),
    // 人机验证输入（发码阶段用）；登录提交时已清空，允许任意长度
    captchaCode: z.string().max(4),
})

/** 密码登录表单（code 为占位字段，见上） */
export const PasswordFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string(),
    password: z.string().min(8, "密码至少 8 位"),
    captchaCode: z.string(),
})
