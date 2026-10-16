import { format, isValid, parseISO } from "date-fns"

/** 墙上时钟字符串 ↔ Date 互译（纯函数）。从 form.tsx 抽出：这是最易错的一半——读写只要有一边走 UTC，每「打开并保存」一次时间就前挪一个时区差，界面照常数据悄悄跑；抽出后两侧对称性可不起浏览器断言 */

/** 墙上时钟形状，与 datetime-local 输入值同形（不带时区偏移），读写都按本地时区解释、两侧对称——CMS 上下线时间曾因回填走 UTC 每保存前挪 8 小时 */
export const WALL_CLOCK = "yyyy-MM-dd'T'HH:mm"

/** DateTimeField 支持的 Locale 档位（纯 UI 包不引 @shop/common，形状在这里自证） */
export type WallClockLocale = "zh-Hans-CN" | "en-US"

const TIME_INPUT = "HH:mm"

/** 触发框上的展示形状：存的值仍是 WALL_CLOCK，只有显示出去的文案换形 */
const DISPLAY: Record<WallClockLocale, string> = {
    "zh-Hans-CN": "yyyy-MM-dd HH:mm",
    "en-US": "MMM d, yyyy, h:mm a",
}

/** 输入值 → Date：空串与「有字但不是日期」都算没选（留空是真实业务态：定时上线留空 = 立即生效） */
export function parseWallClock(value: string): Date | undefined {
    if (!value) return undefined
    const parsed = parseISO(value)
    return isValid(parsed) ? parsed : undefined
}

/**
 * 日期与时分各改各的、合起来才写回：只选日不选时不会把时间悄悄归 00:00。在拷贝上改时分（不原地改传入 Date——它是日历 selected，改了脏）；秒/毫秒清零（留旧秒位会让同一分钟两次保存写出两个值）。
 * 时/分解析不出来（空串、abc）按 0 收——`|| 0` 就是这条兜底，别当笔误。
 */
export function composeWallClock(date: Date, time: string): string {
    const [hour, minute] = time.split(":")
    const next = new Date(date)
    next.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0)
    return format(next, WALL_CLOCK)
}

export function formatWallClockTime(date: Date): string {
    return format(date, TIME_INPUT)
}

export function formatWallClockDisplay(date: Date, locale: WallClockLocale): string {
    return format(date, DISPLAY[locale])
}
