import { ShopReviewStatus } from "@shop/api/sdk"
import { statusOptions } from "@shop/common"
import { z } from "zod"

/** 店铺审核状态（与后端枚举对齐）：URL search 参数与筛选下拉都过这一个 schema */
export const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

/** 状态徽标：列表列、筛选下拉的选项与文案都从这一份读，三处各写一遍迟早措辞分家 */
export const STATUS_BADGE: Record<
    ShopReviewStatus,
    { label: string; variant: "warning" | "success" | "destructive-subtle" }
> = {
    PENDING: {
        label: "待审核",
        variant: "warning",
    },
    APPROVED: {
        label: "已通过",
        variant: "success",
    },
    REJECTED: {
        label: "已驳回",
        variant: "destructive-subtle",
    },
}

/** 筛选下拉的选项：从上面那张表派生，值仍是状态枚举（不是 Object.entries 给的 string） */
export const STATUS_OPTIONS = statusOptions(STATUS_BADGE)
