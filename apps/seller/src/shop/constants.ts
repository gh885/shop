import { CreateShopRequestSchema } from "@shop/api/schemas"
import type { ShopResponse } from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"

// 镜像契约 CreateShopRequest.name 的 maxLength，不另写字面量（入口与列宽的相等由后端 FieldRuleVocabularyTest 核对）
export const SHOP_NAME_MAX = CreateShopRequestSchema.properties.name.maxLength

type ShopStatusKey = Extract<SellerMessageKey, `shop.status.${string}`>

export const SHOP_STATUS_META: Record<
    ShopResponse["status"],
    { labelKey: ShopStatusKey; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
    PENDING_REVIEW: { labelKey: "shop.status.PENDING_REVIEW", variant: "secondary" },
    ACTIVE: { labelKey: "shop.status.ACTIVE", variant: "default" },
    REJECTED: { labelKey: "shop.status.REJECTED", variant: "destructive" },
    DISABLED: { labelKey: "shop.status.DISABLED", variant: "outline" },
}
