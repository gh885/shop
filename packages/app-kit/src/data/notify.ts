import { toApiError, type ApiError } from "@shop/common/contract"
import { track } from "@shop/common/monitoring"
import { DEFAULT_LOCALE, localeOf, type AppLocale, type I18nInstance } from "@shop/common/i18n"
import { errorTextPlan } from "../i18n/error-keys"
import { toast } from "@shop/ui-web"
import { resolveToastText, type ToastText } from "./toast-text"

/**
 * 应用层反馈：事实由 catalog 工厂检查，通知弹出时才从注入的 i18next 实例翻译。
 * 只在客户端事件回调里使用，不在渲染期或 SSR 调用；与 MutationCache 共用错误展示策略。
 */
let notifyI18n: I18nInstance | null = null

/**
 * 装配时注入当前应用的 i18next 实例（与 `createAppQueryClient` / `I18nProvider` 同一份）。
 * seller/admin 在 `mountSpa`、web 在客户端 `getContext` 各调一次；SSR 不注入（`notify` 不在服务端调用）。
 */
export function bindNotifyI18n(i18n: I18nInstance): void {
    notifyI18n = i18n
}

/** 弹出时刻把 `ToastText` 变成句子：`message(key, params)` 按注入实例的当前语言现取，没绑定实例就退回 key 本身。 */
function resolveAtShowTime(text: ToastText): string {
    return notifyI18n ? resolveToastText(text, notifyI18n) : text.message
}

type ToastType = "success" | "error" | "info" | "warning"

/** 唯一的落底层 `toast.add` 处：入参一律是**已解析的成品字符串**，翻译在更上面一层做完。 */
function show(type: ToastType, title: string, description?: string): void {
    toast.add({ title, description, type })
}

/**
 * §7.3 取文案链的落地出口：给错误形状与 locale，`errorTextPlan` 现取那句、弹出，
 * 并记账走过的 detail / status 兜底支（判据见 `fromError` 文档）。`fallbackText` 是已解析的场景句
 * 或 undefined（由 `errorTextPlan` 落通用网络句）。
 */
function showApiError(apiError: ApiError, locale: AppLocale, fallbackText?: string): void {
    const plan = errorTextPlan(apiError, locale, fallbackText)
    show("error", plan.text)
    if (plan.source !== "detail" && plan.source !== "status") return
    // 走 track 而不是 captureError：这是**频次**信号（error-codes.md 判据的第二半），
    // 而 captureError 按指纹限次 3 条、还会把状态码归一化掉——两者都会把频次数据毁掉。
    // 字段结构化上报，不再拼进 message 让接收端正则捞（详见 MonitorFallbackEvent）
    track({
        kind: "fallback",
        source: plan.source,
        status: apiError.status,
        code: apiError.code,
        // 只给日志用：指标标签里放不下句子，而升级要落到具体某一句话上
        detail: apiError.detail,
    })
}

export const notify = {
    success(title: ToastText, description?: ToastText) {
        show(
            "success",
            resolveAtShowTime(title),
            description === undefined ? undefined : resolveAtShowTime(description),
        )
    },
    error(title: ToastText, description?: ToastText) {
        show(
            "error",
            resolveAtShowTime(title),
            description === undefined ? undefined : resolveAtShowTime(description),
        )
    },
    info(title: ToastText, description?: ToastText) {
        show(
            "info",
            resolveAtShowTime(title),
            description === undefined ? undefined : resolveAtShowTime(description),
        )
    },
    warning(title: ToastText, description?: ToastText) {
        show(
            "warning",
            resolveAtShowTime(title),
            description === undefined ? undefined : resolveAtShowTime(description),
        )
    },
    /** 错误按 errorTextPlan 的统一策略展示；默认语言与场景消息都在弹出时读取。 */
    fromError(err: unknown, locale?: AppLocale, fallback?: ToastText) {
        const resolvedLocale = locale ?? (notifyI18n ? localeOf(notifyI18n) : DEFAULT_LOCALE)
        showApiError(
            toApiError(err),
            resolvedLocale,
            fallback === undefined ? undefined : resolveAtShowTime(fallback),
        )
    },
}

/** MutationCache 已用其闭包 i18n 翻译；内部出口不再读取全局 notifyI18n。 */
export function mutationSuccess(title: string): void {
    show("success", title)
}

/** MutationCache 专用失败提示：同 `mutationSuccess`，`fallbackText` 是闭包 i18n 已解析的场景句。 */
export function mutationError(err: unknown, locale: AppLocale, fallbackText?: string): void {
    showApiError(toApiError(err), locale, fallbackText)
}
