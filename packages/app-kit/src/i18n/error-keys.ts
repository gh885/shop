import { type ApiError, type AppLocale, ErrorCodes } from "@shop/common"

import { translateAppKit } from "./messages"
import type { AppKitMessageKey } from "../locales/messages.gen"

/**
 * code → catalog key：§7.3「后端出 code，前端出文案」在类型这一边的落点。
 *
 * 两张保证由 `satisfies` 一起给：每个 code 都要有一格（`Record` 不收漏键），每格的值必须是
 * catalog 里真实存在的 key（`AppKitMessageKey` 收错名）。所以「加了码忘了配文案」是编译错误，
 * 不是等某个用户撞上才看见的静默回退——这一格过去由 `error-messages.ts` 的
 * `Record<ErrorCode, …>` 给，那份字典删了，保证不能跟着删。
 *
 * 反过来（catalog 里有、词表里没有的多余 `error.*` 条目）类型看不见，由
 * `ErrorCodeVocabularyTest` 拿 `docs/error-codes.md` 的 Code 列与两份 `error.json` 两向核。
 */
const ERROR_KEYS = {
    SMS_RATE_LIMIT: "error.SMS_RATE_LIMIT",
    SMS_DAILY_LIMIT: "error.SMS_DAILY_LIMIT",
    SMS_CODE_EXPIRED: "error.SMS_CODE_EXPIRED",
    SMS_CODE_INVALID: "error.SMS_CODE_INVALID",
    CAPTCHA_REQUIRED: "error.CAPTCHA_REQUIRED",
    CAPTCHA_EXPIRED: "error.CAPTCHA_EXPIRED",
    CAPTCHA_INVALID: "error.CAPTCHA_INVALID",
    TOKEN_EXPIRED: "error.TOKEN_EXPIRED",
    INVALID_TOKEN: "error.INVALID_TOKEN",
    REFRESH_TOKEN_REUSED: "error.REFRESH_TOKEN_REUSED",
    USER_DISABLED: "error.USER_DISABLED",
    STAFF_DISABLED: "error.STAFF_DISABLED",
    PERMISSION_DENIED: "error.PERMISSION_DENIED",
    SHOP_NAME_TAKEN: "error.SHOP_NAME_TAKEN",
    SHOP_LIMIT_EXCEEDED: "error.SHOP_LIMIT_EXCEEDED",
    INSUFFICIENT_STOCK: "error.INSUFFICIENT_STOCK",
    COUPON_ALREADY_CLAIMED: "error.COUPON_ALREADY_CLAIMED",
    AFTER_SALE_ALREADY_REFUNDED: "error.AFTER_SALE_ALREADY_REFUNDED",
    CATEGORY_NOT_LEAF: "error.CATEGORY_NOT_LEAF",
    CATEGORY_DISABLED: "error.CATEGORY_DISABLED",
    ADDRESS_LIMIT_EXCEEDED: "error.ADDRESS_LIMIT_EXCEEDED",
    MERCHANT_ADDRESS_LIMIT_EXCEEDED: "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED",
    BANNER_TIME_RANGE_INVALID: "error.BANNER_TIME_RANGE_INVALID",
    FORBIDDEN_WORD_HIT: "error.FORBIDDEN_WORD_HIT",
    RESPONSE_VALIDATION_FAILED: "error.RESPONSE_VALIDATION_FAILED",
} as const satisfies Record<(typeof ErrorCodes)[keyof typeof ErrorCodes], AppKitMessageKey>

/** 按 wire 上那个码值索引，所以 `get` 拿裸字符串也不需要断言 */
const BY_CODE = new Map<string, AppKitMessageKey>(Object.entries(ERROR_KEYS))

/**
 * 迁移期仍把后端 detail 当文案的那两个码（§7.3 的兜底链，不是设计如此）。
 *
 * 共同的形状：**那句话的关键信息只在 detail 里**。两条地址上限的数字来自后端常量
 * （`20` / `200`，前端没有对边，写进 catalog 就是一个会谎报的字面量），所以 catalog 里这两条今天是
 * 不带参数的占位句。
 *
 * `FORBIDDEN_WORD_HIT` 已经退出这份清单：命中的字段与词现在由 `errors[].field/value` 作为**数据**出一次
 * （COM-01 那条参数通道，见 docs/error-codes.md），卖家端把词嵌进自己语种的那句（`product.publish.forbiddenWordHit`），
 * 不再从中文 detail 里正则捞。
 *
 * 退出条件：把那个值从句子拆出来做成参数——走 `errors[].value` 那条通道（`FORBIDDEN_WORD_HIT`
 * 就是这么退的；扩展属性本来就进不了 api-docs，所以这条不要 `pnpm gen:sdk`），或按 P3′-b 代价 2
 * 把它写进契约再 `pnpm gen:sdk`；然后 `error.<CODE>` 写成带 `{slot}` 的消息，从这里删掉这个码就改走 catalog。
 * `error-keys.test.ts` 钉的是「这里列出的每一条，其 catalog 句子确实还没参数化」——
 * 真参数化了却忘了删这里，那条断言当场红。
 *
 * 只在中文界面 detail 优先：非中文拿 catalog 那句占位（`errorTextPlan` 第 4 支），宁可少说一个数字，
 * 也不在英文界面上印中文。
 */
const DETAIL_FIRST = new Set(["ADDRESS_LIMIT_EXCEEDED", "MERCHANT_ADDRESS_LIMIT_EXCEEDED"])

/**
 * 后端 `detail` 的语种。apps/server 里 `Validate` / `BusinessException` 的字面量全是中文，
 * 后端没有第二份语言目录（也不该有：文案归前端，见 i18n.md §7.3）。所以 detail 只有在中文界面
 * 才是「同语言且具体」的那句，其它语言拿它当文案就是漏中文。
 */
const DETAIL_LOCALE: AppLocale = "zh-CN"

/** 状态码 → 通用句：后端没给 code（或给的码没登记）时，非中文界面按这一格兜底 */
const STATUS_KEY_PAIRS: [number, AppKitMessageKey][] = [
    [400, "appKit.error.badRequest"],
    [401, "appKit.error.unauthorized"],
    [403, "appKit.error.forbidden"],
    [404, "appKit.error.notFound"],
    [409, "appKit.error.conflict"],
    [422, "appKit.error.validation"],
    [429, "appKit.error.rateLimited"],
]
const STATUS_KEYS = new Map<number, AppKitMessageKey>(STATUS_KEY_PAIRS)

function statusKey(status: number): AppKitMessageKey {
    if (status >= 500) return "appKit.error.serverError"
    return STATUS_KEYS.get(status) ?? "appKit.error.network"
}

/** 这个码有没有可以直接给用户看的 catalog 文案；没有就走下面的兜底链 */
export function errorKeyFor(code: string | undefined): AppKitMessageKey | undefined {
    if (code === undefined || DETAIL_FIRST.has(code)) return undefined
    return BY_CODE.get(code)
}

/** 迁移期例外清单，只给测试核「这两条还没参数化」用 */
export const DETAIL_FIRST_CODES = [...DETAIL_FIRST]

/** 这句话是从哪一格取来的——`notify` 据此上报「走了兜底」，见 docs/error-codes.md 的升级判据 */
export type ErrorTextSource = "catalog" | "detail" | "status" | "fallback" | "network"

export interface ErrorTextPlan {
    source: ErrorTextSource
    text: string
}

/**
 * §7.3 那条取文案链的纯函数版：给错误形状与 locale，返回该给用户看的那句话，以及它取自哪一格。
 *
 * 1. 命中登记码 → catalog 那句（语言无关、具体）。
 * 2. 没听到后端说话（status 0）→ 调用方的场景文案，没给则通用网络提示。
 * 3. 中文界面 → 后端 `detail`。它就是中文，且比任何通用句都具体（「该优惠券已停止发放」）。
 * 4. 其它语言 + detail 优先那两条 → catalog 那句**不具体**的占位（宁可含糊，不混语种）。
 * 5. 其它语言 + 拿不到 code → 调用方场景文案，没给则按状态码的通用句。
 *
 * 3 / 5 是「后端 267 个报错出口不带 code」这一现实的兜底面（普查与口径见 docs/error-codes.md），不是设计目标：
 * 非中文界面在这一支丢掉具体原因，`notify.fromError` 会把走过的 detail / status 两支上报，
 * 哪句该升级成 code 由真实频次决定，而不是猜那 204 句里哪句重要。
 *
 * 它存在的理由还是**同一条链不许有两种语感**：全局 toast（`notify.fromError`）与表单里内联渲染的报错
 * （登录表单、注销弹窗、改密表单、发品横幅）是同一个错误，各写一遍就会一个走 catalog、一个走 detail——
 * 用户在同一屏上看到两种来源的句子。
 */
export function errorTextPlan(err: ApiError, locale: AppLocale, fallback?: string): ErrorTextPlan {
    const key = errorKeyFor(err.code)
    if (key !== undefined) return { source: "catalog", text: translateAppKit(key, locale) }
    if (err.status === 0) {
        return {
            source: fallback === undefined ? "network" : "fallback",
            text: fallback ?? translateAppKit("appKit.error.network", locale),
        }
    }
    if (locale === DETAIL_LOCALE) return { source: "detail", text: err.detail }
    const detailFirstKey = err.code === undefined ? undefined : BY_CODE.get(err.code)
    if (detailFirstKey !== undefined) {
        return { source: "catalog", text: translateAppKit(detailFirstKey, locale) }
    }
    return {
        source: fallback === undefined ? "status" : "fallback",
        text: fallback ?? translateAppKit(statusKey(err.status), locale),
    }
}

export function errorText(err: ApiError, locale: AppLocale, fallback?: string): string {
    return errorTextPlan(err, locale, fallback).text
}
