import { toApiError, type ApiError } from "@shop/common/contract"
import { track } from "@shop/monitoring"
import { DEFAULT_LOCALE, localeOf, type AppLocale, type I18nInstance } from "@shop/i18n"
import { errorTextPlan } from "../i18n/error-keys"
import { toast } from "@shop/ui-web"
import { resolveToastText, type ToastText } from "./toast-text"

/** 反馈出口：文案事实由 catalog 工厂检查，弹出时才从注入的 i18next 现译；只在客户端事件回调里用，SSR 不调。 */
let notifyI18n: I18nInstance | null = null

/** 装配时注入 i18next 实例：三端各调一次（seller/admin 在 mountSpa、web 在客户端 getContext），SSR 不注入 */
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

/** §7.3 取文案链的落地出口：errorTextPlan 现取那句并弹出，判据见「错误码判据」 */
function showApiError(apiError: ApiError, locale: AppLocale, fallbackText?: string): void {
    const plan = errorTextPlan(apiError, locale, fallbackText)
    show("error", plan.text)
    if (plan.source !== "detail" && plan.source !== "status") return
    // 走 track 不走 captureError：captureError 按指纹限 3 条且归一化状态码，会把兜底频次信号毁掉
    track({
        kind: "fallback",
        source: plan.source,
        status: apiError.status,
        code: apiError.code,
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
