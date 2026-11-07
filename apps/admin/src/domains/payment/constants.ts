import type { AdminMessageKey } from "#/locales/messages.gen"

export const SUSPENSE_READ_PERMISSION = "SUSPENSE_READ"

/** 挂账状态词表：open 待处理；resolved 已销账（resolution 二选一：原路退款 / 驳回）。 */
export const SUSPENSE_STATUSES = ["open", "resolved"] as const
export type SuspenseStatus = (typeof SUSPENSE_STATUSES)[number]

type SuspenseStatusKey = Extract<AdminMessageKey, `payment.status.${string}`>

export const SUSPENSE_STATUS_META = {
    open: { labelKey: "payment.status.open", variant: "warning" },
    resolved: { labelKey: "payment.status.resolved", variant: "secondary" },
} as const satisfies Record<
    SuspenseStatus,
    { labelKey: SuspenseStatusKey; variant: "warning" | "secondary" }
>

/** 挂账原因词表（后端 SuspenseReason，库里的值原样展示）。 */
export const SUSPENSE_REASONS = ["LATE_CALLBACK", "AMOUNT_MISMATCH", "ORDER_CLOSED"] as const
export type SuspenseReason = (typeof SUSPENSE_REASONS)[number]

type SuspenseReasonKey = Extract<AdminMessageKey, `payment.reason.${string}`>

export const SUSPENSE_REASON_META = {
    LATE_CALLBACK: { labelKey: "payment.reason.LATE_CALLBACK" },
    AMOUNT_MISMATCH: { labelKey: "payment.reason.AMOUNT_MISMATCH" },
    ORDER_CLOSED: { labelKey: "payment.reason.ORDER_CLOSED" },
} as const satisfies Record<SuspenseReason, { labelKey: SuspenseReasonKey }>

/** 已销账行的处置结果；空 = 未知词表值，原样兜底。 */
export const SUSPENSE_RESOLUTIONS = ["refunded", "dismissed"] as const
export type SuspenseResolution = (typeof SUSPENSE_RESOLUTIONS)[number]

type SuspenseResolutionKey = Extract<AdminMessageKey, `payment.resolution.${string}`>

export const SUSPENSE_RESOLUTION_META = {
    refunded: { labelKey: "payment.resolution.refunded" },
    dismissed: { labelKey: "payment.resolution.dismissed" },
} as const satisfies Record<SuspenseResolution, { labelKey: SuspenseResolutionKey }>
