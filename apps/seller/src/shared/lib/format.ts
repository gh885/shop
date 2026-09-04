import { format, isValid } from "date-fns"

/** ISO 时间 → 「yyyy-MM-dd HH:mm」（非法日期原样返回，与展示兜底约定一致） */
export function formatDateTime(iso: string): string {
    const d = new Date(iso)
    return isValid(d) ? format(d, "yyyy-MM-dd HH:mm") : iso
}

/** ISO 时间 → 「yyyy-MM-dd」 */
export function formatDate(iso: string): string {
    const d = new Date(iso)
    return isValid(d) ? format(d, "yyyy-MM-dd") : iso
}
