import { ErrorCodes } from "@shop/common"

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

/** 这个码有没有前端文案；没有就走 §7.3 的兜底链 */
export function errorKeyFor(code: string | undefined): AppKitMessageKey | undefined {
    return code === undefined ? undefined : BY_CODE.get(code)
}
