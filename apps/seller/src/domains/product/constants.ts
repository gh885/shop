import { message } from "#/locales/message"
import { SkuUpdateItemSchema } from "@shop/api/schemas"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { ToastText } from "@shop/app-kit/data"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SkuEditKind } from "./draft-rules"
import type { GateFact, GateNotice } from "./edit-rules"
import type { ProductStatus } from "@shop/api/sdk"

// 值是 catalog key（非某句中文）：兼作 merge 与搜索的匹配键，必须语言无关且稳定。出文案（t 成当前语言）在 display.ts 的 skuDisplayLabel
export const SKU_LABEL_SINGLE = "product.sku.singleSpec" as const

// 上限直接取生成的 SkuUpdateItem 契约；与类目名 64、承运商名 50 等撞数常量刻意不合并（各处独立契约）
export const SKU_CODE_MAX = SkuUpdateItemSchema.properties.skuCode.maxLength

// SKU 输入格的校验消息事实（form.ts 的 schema 与单元格解析共用；带 key 无句子，句子在渲染边界 t 出）
export const SKU_CELL_ERROR = {
    price: message("product.err.priceFormat"),
    count: message("product.err.countFormat"),
} as const

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

// 发布门禁/会话提示：edit-rules.ts 出结构化事实，这里只放事实 → 文案 key 的纯表，句子在调用点 t(key) 出
type GateErrorKey = Extract<SellerMessageKey, `product.gate.error.${string}`>
type GateNoticeKey = Extract<SellerMessageKey, `product.gate.notice.${string}`>

export const GATE_ERROR_KEY: Record<GateFact, GateErrorKey> = {
    publishUnpriced: "product.gate.error.publishUnpriced",
    priceRequired: "product.gate.error.priceRequired",
}

export const GATE_NOTICE_KEY: Record<GateNotice, GateNoticeKey> = {
    warehouse: "product.gate.notice.warehouse",
    published: "product.gate.notice.published",
}
