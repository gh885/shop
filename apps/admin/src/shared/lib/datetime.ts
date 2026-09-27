/**
 * datetime-local 输入值 ↔ 带时区的 ISO 时刻：两侧都按**本地墙上时钟**翻译，秒位丢弃。
 *
 * 为什么两侧同用 format（而不是读回时 toISOString）：回填方向曾因用 toISOString()（UTC）
 * 与提交方向（本地）不对称，每「打开并保存」一次时间就往前挪一个时区差（+08 即 8 小时）。
 * datetime-local 读的就是墙上时钟，故两侧都按墙上时钟走。
 *
 * 放在 shared 而不是 cms：banner 上下线、审计时间窗都要用，两处各抄一份就会有一处悄悄用 UTC。
 */
import { format, isValid } from "date-fns"

/** 带时区 ISO → datetime-local 输入值（空/非法都给空串，交给输入框显示占位） */
export const toDateTimeLocal = (iso?: string | null) => {
    if (!iso) return ""
    const d = new Date(iso)
    return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : ""
}

/** datetime-local 输入值 → 带时区 ISO（空串给 undefined，即契约缺省） */
export const fromDateTimeLocal = (local: string) =>
    local ? new Date(local).toISOString() : undefined
