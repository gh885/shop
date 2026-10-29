import { message } from "#/locales/message"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { ToastText } from "@shop/app-kit/data"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SkuEditKind } from "./draft-rules"
import { PRODUCT_STATUSES, type ProductStatus } from "#/domains/order/constants"

// 值是 catalog key（非某句中文）：兼作 merge 与搜索的匹配键，必须语言无关且稳定
export const SKU_LABEL_SINGLE = "product.sku.singleSpec" as const

// SKU 输入格的校验消息事实（form.ts 的 schema 与单元格解析共用；带 key 无句子，句子在渲染边界 t 出）
export const SKU_CELL_ERROR = {
    price: message("product.err.priceFormat"),
    count: message("product.err.countFormat"),
} as const

type ProductStatusKey = Extract<SellerMessageKey, `product.status.${string}`>

export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    {
        labelKey: ProductStatusKey
        variant: "success" | "secondary" | "warning" | "destructive" | "outline"
    }
> = {
    draft: { labelKey: "product.status.draft", variant: "outline" },
    pending: { labelKey: "product.status.pending", variant: "warning" },
    approved: { labelKey: "product.status.approved", variant: "secondary" },
    rejected: { labelKey: "product.status.rejected", variant: "destructive" },
    online: { labelKey: "product.status.online", variant: "success" },
    offline: { labelKey: "product.status.offline", variant: "secondary" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<ProductStatus, ProductStatusKey>
> = statusOptionsFromKeys(PRODUCT_STATUS_META)

export { PRODUCT_STATUSES }

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
