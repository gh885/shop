import type { AdminMessageKey } from "#/locales/messages.gen"

export const GOVERNANCE_SHOP_REVIEW_PERMISSION = "SHOP_REVIEW"

/**
 * 入驻与经营状态词表：审核队列只过滤前三档（applied/active/rejected），
 * suspended 起是治理处置链路的状态，队列里可能出现、只读展示。
 */
export const ONBOARDING_STATUSES = [
    "applied",
    "active",
    "rejected",
    "suspended",
    "closing",
    "closed",
] as const
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number]

type OnboardingStatusKey = Extract<AdminMessageKey, `governance.status.${string}`>

export const ONBOARDING_STATUS_META = {
    applied: { labelKey: "governance.status.applied", variant: "info" },
    active: { labelKey: "governance.status.active", variant: "success" },
    rejected: { labelKey: "governance.status.rejected", variant: "destructive-subtle" },
    suspended: { labelKey: "governance.status.suspended", variant: "warning" },
    closing: { labelKey: "governance.status.closing", variant: "secondary" },
    closed: { labelKey: "governance.status.closed", variant: "secondary" },
} as const satisfies Record<
    OnboardingStatus,
    {
        labelKey: OnboardingStatusKey
        variant: "info" | "success" | "destructive-subtle" | "warning" | "secondary"
    }
>
