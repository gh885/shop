import { type ApiError, ClientFailureCodes, ErrorCodes } from "@shop/common/contract"
import { createI18n, translate } from "./message"
import type { AppLocale } from "./locale"
import { SHARED_MESSAGES, translateShared } from "./messages"
import type { SharedMessageKey, SharedParamsByKey } from "./locales/messages.gen"

// 只做显式 locale 的纯翻译，不保存用户当前语言。
const errorMessages = createI18n({}, undefined, SHARED_MESSAGES)

/** code → catalog key：`satisfies` 双向保证缺文案编译报错；服务端码与客户端本地失败的判据见「错误码判据」 */
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
    PHONE_ALREADY_REGISTERED: "error.PHONE_ALREADY_REGISTERED",
    LOGIN_NAME_TAKEN: "error.LOGIN_NAME_TAKEN",
    INSUFFICIENT_STOCK: "error.INSUFFICIENT_STOCK",
    PRICE_CHANGED: "error.PRICE_CHANGED",
    QUOTE_EXPIRED: "error.QUOTE_EXPIRED",
    SHIPPING_TEMPLATE_MISSING: "error.SHIPPING_TEMPLATE_MISSING",
    TRACKING_NO_REUSED: "error.TRACKING_NO_REUSED",
    LOGISTICS_BAD_SIGNATURE: "error.LOGISTICS_BAD_SIGNATURE",
    CONFIG_ARCHIVED: "error.CONFIG_ARCHIVED",
    CATEGORY_NOT_LEAF: "error.CATEGORY_NOT_LEAF",
    CATEGORY_DISABLED: "error.CATEGORY_DISABLED",
    BRAND_REQUIRED: "error.BRAND_REQUIRED",
    BRAND_FORBIDDEN: "error.BRAND_FORBIDDEN",
    BRAND_NOT_AVAILABLE: "error.BRAND_NOT_AVAILABLE",
    STANDARD_CATEGORY_MISMATCH: "error.STANDARD_CATEGORY_MISMATCH",
    DUPLICATE_SKU_SPEC: "error.DUPLICATE_SKU_SPEC",
    CATEGORY_CONFIG_INCOMPLETE: "error.CATEGORY_CONFIG_INCOMPLETE",
    CATEGORY_LEVEL_EXCEEDED: "error.CATEGORY_LEVEL_EXCEEDED",
    CATEGORY_CODE_TAKEN: "error.CATEGORY_CODE_TAKEN",
    ATTRIBUTE_CODE_TAKEN: "error.ATTRIBUTE_CODE_TAKEN",
    IDENTITY_ATTRIBUTE_NEEDS_DOMAIN: "error.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN",
    ADDRESS_LIMIT_EXCEEDED: "error.ADDRESS_LIMIT_EXCEEDED",
    FORBIDDEN_WORD_HIT: "error.FORBIDDEN_WORD_HIT",
    REVIEW_WINDOW_EXPIRED: "error.REVIEW_WINDOW_EXPIRED",
    REVIEW_ALREADY_REVIEWED: "error.REVIEW_ALREADY_REVIEWED",
    REVIEW_ALREADY_APPENDED: "error.REVIEW_ALREADY_APPENDED",
    REVIEW_ALREADY_REPLIED: "error.REVIEW_ALREADY_REPLIED",
    REVIEW_LINE_REFUNDED: "error.REVIEW_LINE_REFUNDED",
    CART_SKU_NOT_SELLABLE: "error.CART_SKU_NOT_SELLABLE",
    CART_FULL: "error.CART_FULL",
    FAVORITE_FULL: "error.FAVORITE_FULL",
    IDEMPOTENCY_IN_PROGRESS: "error.IDEMPOTENCY_IN_PROGRESS",
    // ↓ 客户端本地失败：三族此前塌成 `status === 0` 的同一句 `error.network`
    //   「操作失败，请稍后重试」——SDK 写的那句 detail 到不了用户眼前（第 2 支不读 detail）
    NETWORK_ERROR: "error.NETWORK_ERROR",
    REQUEST_TIMEOUT: "error.REQUEST_TIMEOUT",
    REQUEST_ABORTED: "error.REQUEST_ABORTED",
    RESPONSE_VALIDATION_FAILED: "error.RESPONSE_VALIDATION_FAILED",
} as const satisfies Record<
    | (typeof ErrorCodes)[keyof typeof ErrorCodes]
    | (typeof ClientFailureCodes)[keyof typeof ClientFailureCodes],
    SharedMessageKey
>

/** 按 wire 上那个码值索引，所以 `get` 拿裸字符串也不需要断言 */
const BY_CODE = new Map<string, SharedMessageKey>(Object.entries(ERROR_KEYS))

/** 参数化码 → catalog 槽位映射；`error-keys.test.ts` 与两份 error.json 双向核（见「错误码判据」） */
export const CODE_SLOTS: Readonly<Record<string, readonly string[]>> = {
    ADDRESS_LIMIT_EXCEEDED: ["limit"],
    // 购物车 / 收藏夹的上限数字由后端 params.limit 传：改 120 → 200 时前端文案一个字都不用动
    CART_FULL: ["limit"],
    FAVORITE_FULL: ["limit"],
}
// 登记的码必须是真码（防手滑写成一个不存在的码，那条参数通道就永远不会有人填）
CODE_SLOTS satisfies Partial<
    Record<(typeof ErrorCodes)[keyof typeof ErrorCodes], readonly string[]>
>

/** 参数不全返回 undefined，由 errorTextPlan 走安全兜底，不故意让格式化失败。 */
function catalogText(key: SharedMessageKey, err: ApiError, locale: AppLocale): string | undefined {
    const slots = CODE_SLOTS[err.code ?? ""] ?? []
    const values: Record<string, string | number> = {}
    for (const slot of slots) {
        const value = err.params?.[slot]
        if (typeof value !== "string" && typeof value !== "number") return undefined
        values[slot] = value
    }
    const text = translate(errorMessages, key, values, locale)
    return text === key ? undefined : text
}

/** 后端 detail 只有中文（见 docs/conventions/i18n.md） */
const DETAIL_LOCALE: AppLocale = "zh-Hans-CN"

/** 状态码 → 通用句：后端没给 code（或给的码没登记）时按这一格取 */
type StaticSharedKey = Exclude<SharedMessageKey, keyof SharedParamsByKey>
const STATUS_KEY_PAIRS: [number, StaticSharedKey][] = [
    [400, "error.badRequest"],
    [401, "error.unauthorized"],
    [403, "error.forbidden"],
    [404, "error.notFound"],
    [409, "error.conflict"],
    [422, "error.validation"],
    [429, "error.rateLimited"],
    // 405/415 是 GlobalExceptionHandler 接的 Spring MVC 框架级 4xx：不带 code、detail 只有中文，
    // 与 413 同一个坑——没有这两格，非中文界面把它们说成网络问题（见下面 413 那条注释）。
    [405, "error.methodNotAllowed"],
    [415, "error.unsupportedMediaType"],
    // 413 是 RequestBodySizeFilter 那道 1MB 闸门（SEC-04）拒的。没有这一格它落到 statusKey 的兜底
    // `error.network`「操作失败，请稍后重试」——一件与网络无关的事被说成网络问题。
    // 这个状态码不配业务码（「code 不是 HTTP status 的复述」），用户可见文案就靠这一格。
    [413, "error.payloadTooLarge"],
]
const STATUS_KEYS = new Map<number, StaticSharedKey>(STATUS_KEY_PAIRS)

function statusKey(status: number): StaticSharedKey {
    if (status >= 500) return "error.serverError"
    return STATUS_KEYS.get(status) ?? "error.network"
}

/** 这句话是从哪一格取来的——`notify` 据此上报「走了兜底」，见「错误码判据」 的升级判据 */
export type ErrorTextSource = "catalog" | "detail" | "status" | "fallback" | "network"

export interface ErrorTextPlan {
    source: ErrorTextSource
    text: string
}

/**
 * 取文案链的纯函数版：命中登记码→catalog；status 0 无码→场景文案或网络提示；中文界面→detail；其余按状态码通用句。
 * 全局 toast 与表单内联共用此链，不许两种语感（见「错误码判据」）
 */
export function errorTextPlan(err: ApiError, locale: AppLocale, fallback?: string): ErrorTextPlan {
    const key = err.code === undefined ? undefined : BY_CODE.get(err.code)
    if (key !== undefined) {
        const text = catalogText(key, err, locale)
        if (text !== undefined) return { source: "catalog", text }
    }
    if (err.status === 0) {
        return {
            source: fallback === undefined ? "network" : "fallback",
            text: fallback ?? translateShared("error.network", locale),
        }
    }
    if (locale === DETAIL_LOCALE) return { source: "detail", text: err.detail }
    return {
        source: fallback === undefined ? "status" : "fallback",
        text: fallback ?? translateShared(statusKey(err.status), locale),
    }
}

export function errorText(err: ApiError, locale: AppLocale, fallback?: string): string {
    return errorTextPlan(err, locale, fallback).text
}
