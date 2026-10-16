/**
 * 两侧都按本地墙钟往返。哪一侧改成按 UTC 解析，时间每「打开并保存」一次就漂移一个时区。
 */
import { format, isValid } from "date-fns"

import { WALL_CLOCK } from "@shop/ui-web"

export const toDateTimeLocal = (iso?: string | null) => {
    if (!iso) return ""
    const d = new Date(iso)
    return isValid(d) ? format(d, WALL_CLOCK) : ""
}

export const fromDateTimeLocal = (local: string) =>
    local ? new Date(local).toISOString() : undefined
