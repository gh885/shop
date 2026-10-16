import {
    PasswordLoginRequestSchema,
    SmsCodeRequestSchema,
    SmsLoginRequestSchema,
    UpdateProfileRequestSchema,
} from "@shop/api/schemas"
import { z } from "zod"

import { withMinLength } from "@shop/common/domain"

import { messageFactFactory } from "@shop/i18n"

import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

/**
 * 账号侧表单的字段级校验 schema（住 app-kit 因为 LoginForm 在这）：与后端契约对齐的格式规则集中一处，
 * 消费方不止登录（邀请成员用 PhoneSchema、注销用 SmsCodeSchema），同一规则不许有第二份。
 * 句子这层不写：message 放 catalog key（走 login.err.* 而非通用 validation.PATTERN，要能说清「11 位 1 开头」「6 位数字」），数字作 params 出。
 */

/** 本包 catalog key 收在生成物上，不写裸字符串 */
const err = messageFactFactory<
    Extract<AppKitMessageKey, `login.err.${string}`>,
    AppKitParamsByKey
>()

/**
 * 大陆手机号形状取**发码**那一格 `SmsCodeRequest.phone` 的契约（不是登录两格：那两格只有 7..20 长度档，是允许座机的「联系电话」规则）。
 * PHONE_DIGITS 单列一个名字，是因为输入框 maxLength 拿不到正则：邀请框与登录框曾各写一遍且规则不一，后果是「邀请进去的手机号登录不了」。
 */
export const PHONE_PATTERN = new RegExp(SmsCodeRequestSchema.properties.phone.pattern)
export const PHONE_DIGITS = 11
export const PhoneSchema = z.string().regex(PHONE_PATTERN, err("login.err.phoneFormat"))

/**
 * 短信验证码位数取生成的 SmsLoginRequest 契约（对端 Java owner 是 account/dto/AccountFieldRules）。
 * 用 regex 而不是 `.length(6)`：length 会让 `abcdef` 过关——规则不该比控件弱（两框都在 onChange 过滤了非数字）。
 */
export const SMS_CODE_DIGITS = SmsLoginRequestSchema.properties.code.maxLength
const SMS_CODE_PATTERN = new RegExp(`^\\d{${SMS_CODE_DIGITS}}$`)
// `refine` 而不是 `.regex()`：那句要插 `{digits}`，而 check 通道会把 `params` 丢掉（同 `withMaxLength`）
export const SmsCodeSchema = z
    .string()
    .refine(
        (value) => SMS_CODE_PATTERN.test(value),
        err("login.err.smsCodeFormat", { digits: SMS_CODE_DIGITS }),
    )

/** 密码下限（位）：对端 Java owner 是 `AccountFieldRules.PASSWORD_MIN`（REG-01） */
export const PASSWORD_MIN = PasswordLoginRequestSchema.properties.password.minLength

/**
 * 人机验证图的字符数（本期自研 4 位码）。**不是**契约那一格（契约 captchaCode 上限 10，容得下以后换长码）；
 * 输入框按图限长属于严于契约、方向合规。三处（图字符数、maxLength、schema 的 max）曾各写一遍 4，改码长必漏一处。
 */
export const CAPTCHA_CODE_DIGITS = 4

/** 昵称上限（字）：对端 Java owner 是 `AccountFieldRules.NICKNAME_MAX`，资料页那个框镜像它 */
export const NICKNAME_MAX = UpdateProfileRequestSchema.properties.nickname.maxLength

/** 短信/密码双 Tab 共用一套表单值，schema 按 Tab 切换；非当前 Tab 的字段原样透传不校验 */
export const SmsFormSchema = z.object({
    phone: PhoneSchema,
    code: SmsCodeSchema,
    password: z.string(),
    // 人机验证输入（发码阶段用）；登录提交时已清空，允许任意长度
    captchaCode: z.string().max(CAPTCHA_CODE_DIGITS),
})

/** 密码登录表单（code 为占位字段，见上） */
export const PasswordFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string(),
    password: withMinLength(
        z.string(),
        PASSWORD_MIN,
        err("login.err.passwordMin", { min: PASSWORD_MIN }),
    ),
    captchaCode: z.string(),
})
