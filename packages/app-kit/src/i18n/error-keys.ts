import { type ApiError, ClientFailureCodes, ErrorCodes } from "@shop/common/contract"
import { createI18n, translate, type AppLocale } from "@shop/common/i18n"
import { APP_KIT_MESSAGES, translateAppKit } from "./messages"
import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

// 只做显式 locale 的纯翻译，不保存用户当前语言。
const errorMessages = createI18n(APP_KIT_MESSAGES)

/**
 * code → catalog key：§7.3「后端出 code，前端出文案」在类型这一边的落点。
 *
 * 两张保证由 `satisfies` 一起给：每个 code 都要有一格（`Record` 不收漏键），每格的值必须是
 * catalog 里真实存在的 key（`AppKitMessageKey` 收错名）。所以「加了码忘了配文案」是编译错误，
 * 不是等某个用户撞上才看见的静默回退——这一格过去由 `error-messages.ts` 的
 * `Record<ErrorCode, …>` 给，那份字典删了，保证不能跟着删。
 *
 * 表里是**两份**词表的并集，因为取文案这一步不看码从哪来（判据见 `errorTextPlan`）：
 * - 服务端码（`ErrorCodes`）：后端在响应体里发的；
 * - 客户端本地失败（`ClientFailureCodes`）：断网 / 超时 / 取消 / 响应不合契约，后端一个都不发。
 * 两者分家的理由写在 `packages/common/src/contract/client-failure.ts` 的文件头。
 *
 * 反过来（catalog 里有、词表里没有的多余 `error.*` 条目）类型看不见，由
 * `ErrorCodeVocabularyTest` 拿注册表 `openapi/error-codes.mjs` 的 code 与两份 `error.json` 两向核。
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
    // ↓ 客户端本地失败：三族此前塌成 `status === 0` 的同一句 `appKit.error.network`
    //   「操作失败，请稍后重试」——SDK 写的那句 detail 到不了用户眼前（第 2 支不读 detail）
    NETWORK_ERROR: "error.NETWORK_ERROR",
    REQUEST_TIMEOUT: "error.REQUEST_TIMEOUT",
    REQUEST_ABORTED: "error.REQUEST_ABORTED",
    RESPONSE_VALIDATION_FAILED: "error.RESPONSE_VALIDATION_FAILED",
} as const satisfies Record<
    | (typeof ErrorCodes)[keyof typeof ErrorCodes]
    | (typeof ClientFailureCodes)[keyof typeof ClientFailureCodes],
    AppKitMessageKey
>

/** 按 wire 上那个码值索引，所以 `get` 拿裸字符串也不需要断言 */
const BY_CODE = new Map<string, AppKitMessageKey>(Object.entries(ERROR_KEYS))

/**
 * 走 `params` 参数化的码 → catalog 句子里那些 `{槽位}` 分别从 `params` 的哪一格取。
 *
 * 为什么是这张表而不是从模板里正则扒槽位：模板里有什么槽位由 catalog 说，而「这个码有哪些参数」
 * 是**契约**，该声明一次。`error-keys.test.ts` 拿它与两份 `error.json` 双向核——
 * 句子长出 `{` 却没登记，或登记了却没槽位，两边都当场红（这正是旧 `DETAIL_FIRST` 那条断言的反面：
 * 那条盯「登记的还没参数化」，这条盯「参数化的都登记了」）。
 */
export const CODE_SLOTS: Readonly<Record<string, readonly string[]>> = {
    ADDRESS_LIMIT_EXCEEDED: ["limit"],
    MERCHANT_ADDRESS_LIMIT_EXCEEDED: ["limit"],
}
// 登记的码必须是真码（防手滑写成一个不存在的码，那条参数通道就永远不会有人填）
CODE_SLOTS satisfies Partial<
    Record<(typeof ErrorCodes)[keyof typeof ErrorCodes], readonly string[]>
>

/** 参数不全返回 undefined，由 errorTextPlan 走安全兜底，不故意让格式化失败。 */
function catalogText(key: AppKitMessageKey, err: ApiError, locale: AppLocale): string | undefined {
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

/**
 * 后端 `detail` 的语种。apps/server 里 `Validate` / `BusinessException` 的字面量全是中文，
 * 后端没有第二份语言目录（也不该有：文案归前端，见 i18n.md §7.3）。所以 detail 只有在中文界面
 * 才是「同语言且具体」的那句，其它语言拿它当文案就是漏中文。
 */
const DETAIL_LOCALE: AppLocale = "zh-CN"

/** 状态码 → 通用句：后端没给 code（或给的码没登记）时按这一格取 */
type StaticSharedKey = Exclude<AppKitMessageKey, keyof AppKitParamsByKey>
const STATUS_KEY_PAIRS: [number, StaticSharedKey][] = [
    [400, "appKit.error.badRequest"],
    [401, "appKit.error.unauthorized"],
    [403, "appKit.error.forbidden"],
    [404, "appKit.error.notFound"],
    [409, "appKit.error.conflict"],
    [422, "appKit.error.validation"],
    [429, "appKit.error.rateLimited"],
    // 413 是 RequestBodySizeFilter 那道 1MB 闸门（SEC-04）拒的。没有这一格它落到 statusKey 的兜底
    // `appKit.error.network`「操作失败，请稍后重试」——一件与网络无关的事被说成网络问题。
    // 这个状态码不配业务码（「code 不是 HTTP status 的复述」），用户可见文案就靠这一格。
    [413, "appKit.error.payloadTooLarge"],
]
const STATUS_KEYS = new Map<number, StaticSharedKey>(STATUS_KEY_PAIRS)

function statusKey(status: number): StaticSharedKey {
    if (status >= 500) return "appKit.error.serverError"
    return STATUS_KEYS.get(status) ?? "appKit.error.network"
}

/**
 * 这个码有没有可以直接给用户看的 catalog 文案；没有就走下面的兜底链
 *
 * 迁移期那条「detail 优先例外清单」已经空了：最后两条（两条地址上限码）在 2026-10 把上限做成
 * `params.limit` 之后退出。**例外清单不再是机制而是历史**——再往后要长出新条目就是绕过参数通道，
 * 所以这里只留单一出口：有 code 就取 catalog，句子里的数字靠 `params` 参数化。
 */
export function errorKeyFor(code: string | undefined): AppKitMessageKey | undefined {
    if (code === undefined) return undefined
    return BY_CODE.get(code)
}

/** 这句话是从哪一格取来的——`notify` 据此上报「走了兜底」，见 docs/error-codes.md 的升级判据 */
export type ErrorTextSource = "catalog" | "detail" | "status" | "fallback" | "network"

export interface ErrorTextPlan {
    source: ErrorTextSource
    text: string
}

/**
 * §7.3 那条取文案链的纯函数版：给错误形状与 locale，返回该给用户看的那句话，以及它取自哪一格。
 *
 * 1. 命中登记码 → catalog 那句（语言无关、具体）；句子里的数字由 `params` 填（见 catalogText）。
 *    这一支**同时管服务端码与客户端本地失败**（断网 / 超时 / 取消 / 响应不合契约）——
 *    取文案这一步不看码从哪来。此前三族本地失败没有码，只能落到第 2 支那句通用文案，
 *    于是「超时」与「断网」在用户眼里是同一句话。
 * 2. 没听到后端说话（status 0）且**没有码** → 调用方的场景文案，没给则通用网络提示。
 *    第 1 支补上本地失败那三个码之后，这一支只剩「不是从 SDK 错误拦截器来的」那些
 *    （`toApiError` 兜底归一化的非 ApiError），是真正的最后一道。
 * 3. 中文界面 → 后端 `detail`。它就是中文，且比任何通用句都具体（「该优惠券已停止发放」）。
 * 4. 拿不到 code（没给，或不在词表）→ 调用方场景文案，没给则按状态码的通用句。
 *
 * 3 / 4 是「后端 267 个报错出口不带 code」这一现实的兜底面（普查与口径见 docs/error-codes.md），不是设计目标：
 * 非中文界面在这一支丢掉具体原因，`notify.fromError` 会把走过的 detail / status 两支上报，
 * 哪句该升级成 code 由真实频次决定，而不是猜那 204 句里哪句重要。客户端本地失败走第 1 支，不在这个兜底面里。
 *
 * 第 1 支的**参数没填上**时也落到 3 / 4（而不是印出 `{limit}`）：那是后端少给了一格参数，
 * 属于契约破口，照旧走兜底并被上报；中文界面还有 `detail` 那句同语言的具体话可讲。
 *
 * 它存在的理由还是**同一条链不许有两种语感**：全局 toast（`notify.fromError`）与表单里内联渲染的报错
 * （登录表单、注销弹窗、改密表单、发品横幅）是同一个错误，各写一遍就会一个走 catalog、一个走 detail——
 * 用户在同一屏上看到两种来源的句子。
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
            text: fallback ?? translateAppKit("appKit.error.network", locale),
        }
    }
    if (locale === DETAIL_LOCALE) return { source: "detail", text: err.detail }
    return {
        source: fallback === undefined ? "status" : "fallback",
        text: fallback ?? translateAppKit(statusKey(err.status), locale),
    }
}

export function errorText(err: ApiError, locale: AppLocale, fallback?: string): string {
    return errorTextPlan(err, locale, fallback).text
}
