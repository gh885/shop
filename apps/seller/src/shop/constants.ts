import type { ShopResponse } from "@shop/api/sdk"

export const SHOP_STATUS_TEXT: Record<ShopResponse["status"], string> = {
    PENDING_REVIEW: "审核中",
    ACTIVE: "正常营业",
    REJECTED: "审核未通过",
    DISABLED: "已封禁",
}

export const SHOP_STATUS_VARIANT: Record<
    ShopResponse["status"],
    "secondary" | "default" | "destructive" | "outline"
> = {
    PENDING_REVIEW: "secondary",
    ACTIVE: "default",
    REJECTED: "destructive",
    DISABLED: "outline",
}
