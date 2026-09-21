import { CmsStatus } from "@shop/api/sdk"
import { z } from "zod"

/** 跳转目标类型：与后端三个 Request 的 @Pattern("PRODUCT|CATEGORY|CAMPAIGN|SEARCH|URL") 对齐 */
export const TargetTypeSchema = z.enum(["PRODUCT", "CATEGORY", "CAMPAIGN", "SEARCH", "URL"])
export type TargetType = z.infer<typeof TargetTypeSchema>

export const TARGET_TYPE_LABEL: Record<TargetType, string> = {
    PRODUCT: "商品",
    CATEGORY: "类目",
    CAMPAIGN: "活动",
    SEARCH: "搜索词",
    URL: "外链",
}

/** 前台已消费的导航位 / 运营位（筛选下拉选项；新增位时在此扩充） */
export const CMS_NAV_KEYS = ["home"] as const
export const CMS_BANNER_SLOTS = ["home_promo"] as const

export const CmsStatusSchema = z.enum(CmsStatus)

export const STATUS_BADGE: Record<CmsStatus, { label: string; variant: "success" | "secondary" }> =
    {
        ENABLED: { label: "启用中", variant: "success" },
        DISABLED: { label: "已停用", variant: "secondary" },
    }

/** OffsetDateTime ISO ↔ datetime-local 输入值（本地时区，秒位丢弃） */
export const toDateTimeLocal = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 16) : ""

export const fromDateTimeLocal = (local: string) =>
    local ? new Date(local).toISOString() : undefined

/** 表单空串 → 契约缺省（后端把 null 与缺省一视同仁，统一发缺省） */
export const blankToUndefined = (s?: string) => s?.trim() || undefined
