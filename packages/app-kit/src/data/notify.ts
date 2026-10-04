import { toApiError, type ApiError } from "@shop/common/contract"
import { track } from "@shop/common/monitoring"
import { DEFAULT_LOCALE, localeOf, type AppLocale, type I18nInstance } from "@shop/common/i18n"
import { errorTextPlan } from "../i18n/error-keys"
import { toast } from "@shop/ui-web"
import { resolveToastText, type ToastText } from "./toast-text"

/**
 * 全局 toast 封装（基于 @shop/ui-web 的 BaseUI toast 单例，三个 SPA 共用）。
 *
 * 这是「应用层胶水」：同时知道后端契约（ApiError）与 UI（toast）——
 * 「错误文案按 code 取前端 catalog、取不到才落回后端 detail」是产品决策（i18n.md §7.3），
 * 不属于 @shop/ui-web（纯 UI，不知道契约）也不属于 @shop/common（纯错误形状，不做展示决策）。
 * 所有写操作（加购、下单、上下架、审核等）的反馈都走这里，避免散落各自调 toast.add。
 *
 * 注意：只在客户端事件回调里调用（mutation onSuccess/onError 等），
 * 不要在组件渲染期或 SSR 阶段调用。
 *
 * 文案形态：`success/error/info/warning` 收 `ToastText`（`{ key, params }`，裸串已从类型里删掉），句子在**弹出这一刻**
 * 按 `notifyI18n` 的当前语言现取（`resolveToastText`），与 `MutationCache` 的 `meta.success` 同一条
 * 「存事实、边界换句子」的道（§6.1、§7.1）。这条存在的理由是异步路径：组件里 `await` 后调 `notify` 时，
 * 渲染期捕获的 `t`/`locale` 是**发起那一刻**的语言，等待期间用户切了语言就会弹旧语言。改传 `{ key }`、
 * 由 notify 现读注入实例，就把「toast 用什么语言」钉死成「完成时的语言」，裸中文也无处再混进来。
 */

/**
 * 当前应用的 i18next 实例引用（装配注入）。存的是**实例**而非 locale 字符串：实例引用稳定，
 * 语言是它身上的活属性，每次 `localeOf(notifyI18n)` 现读——这正是 §3.5 认可的非组件读取方式，
 * 与被禁的「进程级可变 locale」不是一回事。与 `createAppQueryClient` 注入的是同一份实例。
 */
let notifyI18n: I18nInstance | null = null

/**
 * 装配时注入当前应用的 i18next 实例（与 `createAppQueryClient` / `I18nProvider` 同一份）。
 * seller/admin 在 `mountSpa`、web 在客户端 `getContext` 各调一次；SSR 不注入（`notify` 不在服务端调用）。
 */
export function bindNotifyI18n(i18n: I18nInstance): void {
    notifyI18n = i18n
}

/** 弹出时刻把 `ToastText` 变成句子：`{ key }` 按注入实例的当前语言现取，没绑定实例就退回 key 本身。 */
function resolveAtShowTime(text: ToastText): string {
    return notifyI18n ? resolveToastText(text, notifyI18n) : text.key
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
    /**
     * 从任意错误提取用户可读文案，取法按 §7.3 的链（`errorTextPlan` 里那五支逐条写着，编号与它一致）：
     * ① 登记码 → catalog 那句；② 后端没说话（status 0）→ 场景文案或通用网络提示；
     * ③ 中文界面 → 后端 detail；④ 非中文 + 两个 detail 优先码 → 不带数字的 catalog 占位；
     * ⑤ 非中文 + 拿不到 code → 场景文案或按状态码的通用句。
     *
     * 顺带记一笔账：走到 ③ 或 ⑤（`plan.source` 是 `detail` / `status`）说明这个错误**该有 code 却没有**，
     * 上报后按真实频次决定哪几句值得升级（docs/error-codes.md 的判据第二半）。只在事件回调里调用，
     * 就地渲染的区块不报——渲染期发遥测是副作用，会把 hydration 拖进来。
     *
     * `locale` 缺省时按注入实例现读（`localeOf(notifyI18n)`），异步路径由此拿到「完成时的语言」而非
     * 发起时捕获的那份（见文件头）。`fallback` 是 `ToastText`（`{ key }`），同样按注入实例现取。
     */
    fromError(err: unknown, locale?: AppLocale, fallback?: ToastText) {
        const resolvedLocale = locale ?? (notifyI18n ? localeOf(notifyI18n) : DEFAULT_LOCALE)
        showApiError(
            toApiError(err),
            resolvedLocale,
            fallback === undefined ? undefined : resolveAtShowTime(fallback),
        )
    },
}

/**
 * MutationCache 专用成功提示：句子在 `query-client` 里已用**其闭包 `i18n`** 现取成字符串，故这里收
 * 成品串、不再走 `notifyI18n`。之所以不复用 `notify.success`：`createAppQueryClient(i18n)` 的 `i18n`
 * 是「全局写回执里唯一一个拿不到 hook、又必须知道当前语言」的权威语言源（§3.5 约束 3），不能被换成
 * 装配注入的那份全局 `notifyI18n`——生产里两者同实例、看不出差别，但单测里 `setup` 给 MutationCache
 * 建了 i18n 却不必 `bindNotifyI18n`，此时句子必须来自闭包那份。公共 `notify` 仍只收 `{ key }`，裸串
 * 进不了调用侧；这条内部出口只吃 query-client 自己 resolve 过的成品句，不构成 app 侧的裸串通道。
 */
export function mutationSuccess(title: string): void {
    show("success", title)
}

/** MutationCache 专用失败提示：同 `mutationSuccess`，`fallbackText` 是闭包 i18n 已解析的场景句。 */
export function mutationError(err: unknown, locale: AppLocale, fallbackText?: string): void {
    showApiError(toApiError(err), locale, fallbackText)
}
