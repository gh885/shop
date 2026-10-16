import { message } from "#/locales/message"
import { SkuUpdateItemSchema } from "@shop/api/schemas"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { ToastText } from "@shop/app-kit/data"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SkuEditKind } from "./draft-model"
import type { ProductStatus } from "@shop/api/sdk"

// 上限直接取生成的 SkuUpdateItem 契约；与类目名 64、承运商名 50 等撞数常量刻意不合并（各处独立契约）
export const SKU_CODE_MAX = SkuUpdateItemSchema.properties.skuCode.maxLength

type ProductStatusKey = Extract<SellerMessageKey, `product.status.${string}`>

export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    { labelKey: ProductStatusKey; variant: "success" | "secondary" | "outline" }
> = {
    PUBLISHED: { labelKey: "product.status.PUBLISHED", variant: "success" },
    WAREHOUSE: { labelKey: "product.status.WAREHOUSE", variant: "secondary" },
    DRAFT: { labelKey: "product.status.DRAFT", variant: "outline" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<ProductStatus, ProductStatusKey>
> = statusOptionsFromKeys(PRODUCT_STATUS_META)

type SkuEditTitleKey = Extract<SellerMessageKey, `product.skuEdit.${string}.title`>
type SkuEditNoticeKey = Extract<SellerMessageKey, `product.skuEdit.${string}.notice`>

export const SKU_EDIT_KIND_META: Record<
    SkuEditKind,
    { titleKey: SkuEditTitleKey; noticeKey: SkuEditNoticeKey; okMessage: ToastText }
> = {
    price: {
        titleKey: "product.skuEdit.price.title",
        noticeKey: "product.skuEdit.price.notice",
        okMessage: message("product.toast.skuOkPrice"),
    },
    stock: {
        titleKey: "product.skuEdit.stock.title",
        noticeKey: "product.skuEdit.stock.notice",
        okMessage: message("product.toast.skuOkStock"),
    },
}
