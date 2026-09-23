import type { ShopResponse } from "@shop/api/sdk"

/** 店铺状态：文案与徽章色一张表（分成两张平行表就是两份必须同步的真相） */
export const SHOP_STATUS_META: Record<
    ShopResponse["status"],
    { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
    PENDING_REVIEW: { label: "审核中", variant: "secondary" },
    ACTIVE: { label: "正常营业", variant: "default" },
    REJECTED: { label: "审核未通过", variant: "destructive" },
    DISABLED: { label: "已封禁", variant: "outline" },
}
