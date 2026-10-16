/**
 * datetime-local 输入值 ↔ 带时区的 ISO 时刻：两侧都按**本地墙上时钟**翻译，秒位丢弃。
 *
 * 为什么往返不漂移：回填走 `format`（把带时区的瞬间排成本地墙钟串），提交走
 * `new Date(墙钟串).toISOString()`——`new Date` 对不带 Z 的 date-time 串按本地解析，得到的就是
 * 同一个瞬间，`toISOString` 只是把它序列化出去、不再按 UTC 重读，所以一进一出对得上。
 * 曾因把墙钟串当 UTC 解析（差一个时区），每「打开并保存」一次时间就往前挪 8 小时（+08）。
 *
 * 放在 shared 而不是 cms：banner 上下线、审计时间窗都要用，两处各抄一份就会有一处悄悄用 UTC。
 *
 * 形状本身取 @shop/ui-web 的 `WALL_CLOCK`（包里 DateTimeField 读写的就是它）：这里再写字面量，
 * 改那一侧不会报错，只会让「控件存的值」和「本函数回填的值」差一个时区。
 */
import { format, isValid } from "date-fns"

import { WALL_CLOCK } from "@shop/ui-web"

/** 带时区 ISO → datetime-local 输入值（空/非法都给空串，交给输入框显示占位） */
export const toDateTimeLocal = (iso?: string | null) => {
    if (!iso) return ""
    const d = new Date(iso)
    return isValid(d) ? format(d, WALL_CLOCK) : ""
}

/** datetime-local 输入值 → 带时区 ISO（空串给 undefined，即契约缺省） */
export const fromDateTimeLocal = (local: string) =>
    local ? new Date(local).toISOString() : undefined
