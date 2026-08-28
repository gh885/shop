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

/** 服务端错误归一化后形状 —— 生成的 SDK 错误拦截器已归一化为 { status, detail, code?, requestId? }（见 @shop/api/sdk-client） */
interface NormalizedError {
    status?: number
    detail?: string
    code?: string
    requestId?: string
}

function normalizeError(err: unknown): { status: number; detail: string } {
    if (typeof err === "object" && err !== null && "detail" in err) {
        const e = err as NormalizedError
        return { status: e.status ?? 0, detail: e.detail ?? "请求失败，请稍后重试" }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}

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
    /** 从任意错误提取用户可读文案：后端有 detail 优先展示；网络层错误用调用方场景兜底 */
    fromError(err: unknown, fallback = "操作失败，请稍后重试") {
        const e = normalizeError(err)
        this.error(e.status === 0 ? fallback : e.detail)
    },
}
