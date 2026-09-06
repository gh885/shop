import { toApiError } from "@shop/api"
import { toast } from "@shop/ui-web"

/**
 * 全局 toast 封装（基于 @shop/ui-web 的 BaseUI toast 单例）。
 * 统一审核操作的成功/失败反馈，错误归一化为用户可读文案。
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
