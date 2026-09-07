import { format, isValid } from "date-fns"

/**
 * 时间格式化（三个 SPA 共用的展示约定，属于「应用层胶水」而非契约）：
 * 与 @shop/common 的金额格式化不同——fenToYuan 镜像 Money 契约形状所以归 common，
 * 日期格式是纯展示约定，归 app-kit。非法日期原样返回 iso（与展示兜底约定一致）。
 */

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

/** ISO 时间 → 「MM-dd HH:mm」（非法/缺省显示占位文案，登录设备/最近操作等次要时间用） */
export function formatTimeShort(iso: string): string {
    const d = new Date(iso)
    return isValid(d) ? format(d, "MM-dd HH:mm") : "时间未知"
}
