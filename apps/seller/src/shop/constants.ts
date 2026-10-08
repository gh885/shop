import { CreateShopRequestSchema } from "@shop/api/schemas"
import type { ShopResponse } from "@shop/api/sdk"
import type { SellerMessageKey } from "#/locales/messages.gen"

/**
 * 店铺名上限（字）：镜像契约 `CreateShopRequest.name`，落点 `shop.shops.name` 同宽（列宽与这一格相等，
 * 所以入口比列宽松就会撞库而不是撞校验——这条等式由 apps/server 的 FieldRuleVocabularyTest 核对）。
 */
export const SHOP_NAME_MAX = CreateShopRequestSchema.properties.name.maxLength

/** 店铺状态名的 catalog key 子集：`shop.status.<码>`，写错键即编译错 */
type ShopStatusKey = Extract<SellerMessageKey, `shop.status.${string}`>

/** 店铺状态：文案 key 与徽章色一张表（分成两张平行表就是两份必须同步的真相）。句子在 catalog。 */
export const SHOP_STATUS_META: Record<
    ShopResponse["status"],
    { labelKey: ShopStatusKey; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
    PENDING_REVIEW: { labelKey: "shop.status.PENDING_REVIEW", variant: "secondary" },
    ACTIVE: { labelKey: "shop.status.ACTIVE", variant: "default" },
    REJECTED: { labelKey: "shop.status.REJECTED", variant: "destructive" },
    DISABLED: { labelKey: "shop.status.DISABLED", variant: "outline" },
}
