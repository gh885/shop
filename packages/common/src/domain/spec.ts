/**
 * 订单行规格快照（jsonb 原文）→ 一行展示文案（如「颜色：白；尺码：L」）。
 * 快照是下单时刻的定版数据，买家端与卖家端同念一份；解析失败或空对象返回 null，不挡渲染。
 */
export function formatSpecSnapshot(snapshot: string | null | undefined): string | null {
    const parsed = parseSpecSnapshot(snapshot)
    if (!parsed) return null
    const parts = Object.entries(parsed).map(([key, value]) => `${key}：${String(value)}`)
    return parts.length === 0 ? null : parts.join("；")
}

function parseSpecSnapshot(snapshot: string | null | undefined): Record<string, unknown> | null {
    if (!snapshot) return null
    try {
        const parsed: unknown = JSON.parse(snapshot)
        return isRecordObject(parsed) ? parsed : null
    } catch {
        return null
    }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}
