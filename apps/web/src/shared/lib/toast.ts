import { toApiError } from "@shop/api"
import { toast } from "@shop/ui-web"

/**
 * 全局 toast 封装（基于 @shop/ui-web 的 BaseUI toast 单例）。
 *
 * 职责：统一成功/失败/加载反馈的文案与调用方式，并把任意抛出的错误
 * 归一化成用户可读文案。所有写操作（登录、增删改地址、加购等）
 * 都走这里，避免散落各自调 toast.add。
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
    /** 从任意错误提取用户可读文案：后端有 detail 优先展示；网络层错误（status 0）用调用方场景兜底 */
    fromError(err: unknown, fallback = "操作失败，请稍后重试") {
        const e = toApiError(err)
        this.error(e.status === 0 ? fallback : e.detail)
    },
}
