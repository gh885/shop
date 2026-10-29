import type { CreateDraft } from "./model"

/**
 * 发布草稿的本地持久化：编辑中途刷新/误关不丢内容。
 *
 * <p>存 localStorage（每商家一把 key 由调用方拼）：发布成功或「不恢复」时清除。
 * 读回时只做形状校验——不是完整契约校验，坏数据整体丢弃当没有草稿，
 * 不给半份草稿（半份比没有更坑：类目换了属性键全对不上）。
 */
const KEY = "shop.product.create.draft"

export function loadCreateDraft(): CreateDraft | null {
    try {
        const raw = localStorage.getItem(KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw) as Partial<CreateDraft> | null
        if (
            parsed !== null &&
            typeof parsed === "object" &&
            typeof parsed.title === "string" &&
            Array.isArray(parsed.images)
        ) {
            return parsed as CreateDraft
        }
        localStorage.removeItem(KEY)
        return null
    } catch {
        localStorage.removeItem(KEY)
        return null
    }
}

export function saveCreateDraft(draft: CreateDraft): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(draft))
    } catch {
        // 存不下（隐私模式 / 配额）就静默：草稿是锦上添花，不该挡住发布
    }
}

export function clearCreateDraft(): void {
    localStorage.removeItem(KEY)
}
