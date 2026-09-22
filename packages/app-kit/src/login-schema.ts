import { z } from "zod"

/**
 * 登录表单的字段级校验 schema —— 与 LoginForm 同包同处（原来在 @shop/common 的 forms.ts，
 * 实际唯一消费方就是 login-form，放公共包反而让它隔着包界拿「端无关」的假共享）。
 *
 * 与后端契约对齐的格式规则（手机号、验证码长度、密码长度）集中在此一处，改一处全局同步；
 * 单 app 专属的表单校验仍就近放在对应功能模块，不进这里。
 */

/** 中国大陆手机号 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/
const PhoneSchema = z.string().regex(PHONE_PATTERN, "请输入正确的手机号")

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
