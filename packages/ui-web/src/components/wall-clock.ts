import { format, isValid, parseISO } from "date-fns"

/**
 * 墙上时钟（wall-clock）字符串 ↔ Date 的互相翻译（纯函数，不碰 React、不碰 DOM）。
 *
 * 从 `form.tsx` 的 DateTimeField 里抽出来的原因：这几段是「值怎么长成 `2026-03-05T09:05`、
 * 怎么再变回 Date」的规则，一行都不需要渲染——而它偏偏是最容易错的一半：读写两侧只要有一边
 * 走了 UTC，每「打开并保存」一次时间就前挪一个时区差，界面照常、数据悄悄跑了。抽出来后两侧
 * 对称性能直接不起浏览器就断言，组件文件只留装配与皮肤。
 */

/** 墙上时钟形状，与 `datetime-local` 的输入值同形（不带时区偏移）：
    读写都按本地时区解释，两侧对称——CMS 上下线时间曾因回填走 UTC 而每保存一次前挪 8 小时 */
export const WALL_CLOCK = "yyyy-MM-dd'T'HH:mm"

/** DateTimeField 支持的 Locale 档位（纯 UI 包不引 @shop/common，形状在这里自证） */
export type WallClockLocale = "zh-CN" | "en-US"

/** 时分输入框读写的形状：与 WALL_CLOCK 里的时分那一段同形 */
const TIME_INPUT = "HH:mm"

/** 触发框上的展示形状：存的值仍是 WALL_CLOCK，只有显示出去的文案换形 */
const DISPLAY: Record<WallClockLocale, string> = {
    "zh-CN": "yyyy-MM-dd HH:mm",
    "en-US": "MMM d, yyyy, h:mm a",
}

/** 输入值 → Date：空串与「有字但不是日期」都算没选（留空是真实业务态：定时上线留空 = 立即生效） */
export function parseWallClock(value: string): Date | undefined {
    if (!value) return undefined
    const parsed = parseISO(value)
    return isValid(parsed) ? parsed : undefined
}

/**
 * 日期与时分各改各的，合起来才写回：只选日不选时不会把时间悄悄归到 00:00。
 * 在拷贝上改时/分（不原地改传入的 Date——它同时是日历的 selected，改了就脏）。
 * 秒与毫秒一律清零：控件只到分，留着旧秒位会让「同一分钟」两次保存写出两个值。
 * 时/分解析不出来（空串、`abc`）按 0 收——`|| 0` 就是这条兜底，别当成笔误。
 */
export function composeWallClock(date: Date, time: string): string {
    const [hour, minute] = time.split(":")
    const next = new Date(date)
    next.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0)
    return format(next, WALL_CLOCK)
}

/** Date → 时分输入框的值（`HH:mm`） */
export function formatWallClockTime(date: Date): string {
    return format(date, TIME_INPUT)
}

/** Date → 触发框上的展示文案（跟 Locale 走，与存的原样分开） */
export function formatWallClockDisplay(date: Date, locale: WallClockLocale): string {
    return format(date, DISPLAY[locale])
}
