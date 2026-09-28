import { ErrorCodes } from "../error-codes"
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
import type { AppLocale } from "./locale"

export const ERROR_MESSAGES: Record<ErrorCode, Record<AppLocale, string>> = {
    SMS_RATE_LIMIT: {
        "zh-CN": "验证码发送过于频繁，请稍后再试",
        "en-US": "Too many verification code requests. Please try again later.",
    },
    SMS_DAILY_LIMIT: {
        "zh-CN": "今日验证码已达上限",
        "en-US": "Daily verification code limit reached.",
    },
    SMS_CODE_EXPIRED: {
        "zh-CN": "验证码已过期",
        "en-US": "The verification code has expired.",
    },
    SMS_CODE_INVALID: {
        "zh-CN": "验证码错误",
        "en-US": "Incorrect verification code.",
    },
    CAPTCHA_REQUIRED: {
        "zh-CN": "请先完成图形验证码",
        "en-US": "Please complete the CAPTCHA first.",
    },
    CAPTCHA_EXPIRED: {
        "zh-CN": "图形验证码已过期",
        "en-US": "The CAPTCHA has expired.",
    },
    CAPTCHA_INVALID: {
        "zh-CN": "图形验证码错误",
        "en-US": "Incorrect CAPTCHA.",
    },
    TOKEN_EXPIRED: {
        "zh-CN": "登录已过期，请重新登录",
        "en-US": "Your session has expired. Please sign in again.",
    },
    INVALID_TOKEN: {
        "zh-CN": "登录状态无效，请重新登录",
        "en-US": "Invalid session. Please sign in again.",
    },
    REFRESH_TOKEN_REUSED: {
        "zh-CN": "所有设备已下线",
        "en-US": "All devices have been signed out.",
    },
    USER_DISABLED: {
        "zh-CN": "账号已被禁用",
        "en-US": "This account has been disabled.",
    },
    STAFF_DISABLED: {
        "zh-CN": "员工账号已被禁用，请联系平台管理员",
        "en-US": "This staff account has been disabled. Contact the platform administrator.",
    },
    PERMISSION_DENIED: {
        "zh-CN": "没有操作权限",
        "en-US": "You do not have permission to perform this action.",
    },
    SHOP_NAME_TAKEN: {
        "zh-CN": "店名已被使用，请换一个",
        "en-US": "This shop name is already taken. Please choose another one.",
    },
    SHOP_LIMIT_EXCEEDED: {
        "zh-CN": "每人最多开 1 家店铺",
        "en-US": "Each user can open at most one shop.",
    },
    INSUFFICIENT_STOCK: {
        "zh-CN": "商品库存不足",
        "en-US": "Insufficient stock.",
    },
    COUPON_ALREADY_CLAIMED: {
        "zh-CN": "优惠券已领取",
        "en-US": "Coupon already claimed.",
    },
    AFTER_SALE_ALREADY_REFUNDED: {
        "zh-CN": "该订单已退款",
        "en-US": "This order has already been refunded.",
    },
    CATEGORY_NOT_LEAF: {
        "zh-CN": "请选择三级类目",
        "en-US": "Please select a leaf category.",
    },
    CATEGORY_DISABLED: {
        "zh-CN": "类目已禁用",
        "en-US": "This category is disabled.",
    },
    ADDRESS_LIMIT_EXCEEDED: {
        "zh-CN": "最多保存 20 条收货地址",
        "en-US": "You can save up to 20 shipping addresses.",
    },
    MERCHANT_ADDRESS_LIMIT_EXCEEDED: {
        "zh-CN": "最多添加 200 条地址",
        "en-US": "You can add up to 200 addresses.",
    },
    BANNER_TIME_RANGE_INVALID: {
        "zh-CN": "结束时间不能早于开始时间",
        "en-US": "End time cannot be earlier than start time.",
    },
    FORBIDDEN_WORD_HIT: {
        "zh-CN": "内容包含违禁词，请修改后重新提交",
        "en-US": "Your content contains a prohibited term. Please revise and submit again.",
    },
    RESPONSE_VALIDATION_FAILED: {
        "zh-CN": "响应数据不符合接口契约",
        "en-US": "The server response does not match the API contract.",
    },
}

function isErrorCode(code: string): code is ErrorCode {
    return Object.hasOwn(ERROR_MESSAGES, code)
}

export function getErrorMessage(code: string, locale: AppLocale, fallback: string): string {
    if (!isErrorCode(code)) return fallback
    return ERROR_MESSAGES[code][locale]
}
