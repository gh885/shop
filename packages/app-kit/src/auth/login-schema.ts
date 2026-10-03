import { z } from "zod"

import { withMinLength } from "@shop/common/domain"

import { messageFactFactory } from "@shop/common/i18n"

import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

/**
 * 账号侧表单的字段级校验 schema —— 住在 app-kit，因为 LoginForm 在这里（原来在 @shop/common 的 forms.ts，
 * 但登录框本身是跨端组件，schema 跟着它走比放在更下游的包里更顺）。
 *
 * 与后端契约对齐的格式规则（手机号、验证码位数、密码下限）集中在此一处，改一处全局同步；
 * 消费方不止登录：卖家端邀请成员用 `PhoneSchema`，买家注销用 `SmsCodeSchema`——
 * 这正是「同一规则不许有第二份」的意义，也是为什么位数和形状都得是具名出口。
 * 单 app 专属的业务校验仍就近放在对应功能模块，不进这里。
 *
 * 句子在这一层也不写：`message` 放 catalog key、数字作为 `params` 出（`docs/conventions/i18n.md` §6.1）。
 * key 走 `appKit.login.err.*` 而不是通用的 `validation.PATTERN`，因为「格式不对」不说清差在哪——
 * 登录框要告诉人是「11 位、1 开头」和「6 位数字」。登录框三端共用，本就没有「哪个端的 catalog」
 * 可挑，这正是这几句住 app-kit 的理由。
 */

/** 本包自己的 catalog key 收在生成物上，不写裸字符串 */
const err = messageFactFactory<
    Extract<AppKitMessageKey, `appKit.login.err.${string}`>,
    AppKitParamsByKey
>()

/**
 * 大陆手机号：形状与位数都是这里的 owner。
 *
 * 位数单独给一个名字，是因为输入框的 `maxLength` 拿不到正则——此前登录框、卖家端邀请成员框各写一遍
 * `maxLength={11}`，而邀请框的校验写的是 `^1\d{10}$`（比 owner 宽：`10x`/`11x`/`12x` 段都放行）。
 * 两处不同时的后果不是报错，是「邀请进去的手机号登录不了」：同一概念两份规则，谁也不红。
 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const PHONE_DIGITS = 11
export const PhoneSchema = z.string().regex(PHONE_PATTERN, err("appKit.login.err.phoneFormat"))

/**
 * 短信验证码位数与形状：对端 Java owner 是 `account/dto/AccountFieldRules`（`SMS_CODE_LENGTH` /
 * `SMS_CODE_PATTERN`），两边是否还相等由 `FieldRuleVocabularyTest` 核对。
 *
 * 用 `regex` 而不是 `.length(6)`：`length` 让 `abcdef` 过关——规则本身不该比控件弱
 * （两个输入框都在 onChange 里过滤了非数字）。前端这一格比契约严是允许的：后端只卡长度的那两格
 * 收到的一定是数字，而注销那格后端本来就要求全数字（方向不对称的口径见 GEN-58）。
 */
export const SMS_CODE_DIGITS = 6
const SMS_CODE_PATTERN = new RegExp(`^\\d{${SMS_CODE_DIGITS}}$`)
// `refine` 而不是 `.regex()`：那句要插 `{digits}`，而 check 通道会把 `params` 丢掉（同 `withMaxLength`）
export const SmsCodeSchema = z
    .string()
    .refine(
        (value) => SMS_CODE_PATTERN.test(value),
        err("appKit.login.err.smsCodeFormat", { digits: SMS_CODE_DIGITS }),
    )

/** 密码下限（位）：对端 Java owner 是 `AccountFieldRules.PASSWORD_MIN`（REG-01） */
export const PASSWORD_MIN = 8

/**
 * 人机验证图的字符数（本期是自研 4 位图形码）。
 *
 * 它**不是**契约那一格：`SmsCodeRequest.captchaCode` 的上限是 10（容得下以后换更长的码），
 * 而这一格是「图上印了几个字符」——输入框按图限长属于严于契约，方向合规。
 * 三处（图的字符数、`maxLength`、schema 的 `max`）此前各写一遍 4，改码长时必漏一处。
 */
export const CAPTCHA_CODE_DIGITS = 4

/** 昵称上限（字）：对端 Java owner 是 `AccountFieldRules.NICKNAME_MAX`，资料页那个框镜像它 */
export const NICKNAME_MAX = 30

/**
 * 短信/密码双 Tab 共用一套表单值，schema 按 Tab 切换；非当前 Tab 的字段原样透传不校验。
 * 提交时按 Tab 取对应字段。
 */
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
        err("appKit.login.err.passwordMin", { min: PASSWORD_MIN }),
    ),
    captchaCode: z.string(),
})
