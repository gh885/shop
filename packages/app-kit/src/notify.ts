import { toApiError, type AppLocale } from "@shop/common"

import { translateAppKit } from "./i18n/messages"
import { toast } from "@shop/ui-web"

/**
 * 全局 toast 封装（基于 @shop/ui-web 的 BaseUI toast 单例，三个 SPA 共用）。
 *
 * 这是「应用层胶水」：同时知道后端契约（ApiError）与 UI（toast）——
 * 「后端 detail 优先展示、网络错误（status 0）用兜底文案」是产品决策，
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
     * 从任意错误提取用户可读文案：后端有 detail 优先展示；网络层错误（status 0）用调用方场景兜底。
     *
     * `locale` 必填（§3.5 约束 2）：兜底文案是**这里现取的** `translateAppKit`，不传就等于让
     * 「toast 用什么语言」回到进程级可变量。调用点在组件里就传 `useI18n().locale`，
     * 只有全局 `MutationCache` 那处传不动参，用的是装配注入的 scope。
     */
    fromError(err: unknown, locale: AppLocale, fallback?: string) {
        const e = toApiError(err)
        this.error(
            e.status === 0
                ? (fallback ?? translateAppKit("appKit.error.network", locale))
                : e.detail,
        )
    },
}
