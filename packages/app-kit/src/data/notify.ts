import { toApiError } from "@shop/common/contract"
import { track } from "@shop/common/monitoring"
import { type AppLocale } from "@shop/common/i18n"
import { errorTextPlan } from "../i18n/error-keys"
import { toast } from "@shop/ui-web"

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
 */

export const notify = {
    success(title: string, description?: string) {
        toast.add({ title, description, type: "success" })
    },
    error(title: string, description?: string) {
        toast.add({ title, description, type: "error" })
    },
    info(title: string, description?: string) {
        toast.add({ title, description, type: "info" })
    },
    warning(title: string, description?: string) {
        toast.add({ title, description, type: "warning" })
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
     * `locale` 必填（§3.5 约束 2）：①②④⑤ 的句子是按它现取的，不传就等于让
     * 「toast 用什么语言」回到进程级可变量。调用点在组件里就传 `useI18n().locale`，
     * 只有全局 `MutationCache` 那处传不动参，用的是装配注入的 scope。
     */
    fromError(err: unknown, locale: AppLocale, fallback?: string) {
        const apiError = toApiError(err)
        const plan = errorTextPlan(apiError, locale, fallback)
        this.error(plan.text)
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
    },
}
