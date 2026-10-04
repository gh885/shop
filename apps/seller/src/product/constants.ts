import { SkuUpdateItemSchema } from "@shop/api/schemas"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { LocalizedText } from "@shop/app-kit/data"
import type { SellerMessageKey } from "#/locales/messages.gen"
import type { SkuEditKind } from "./draft-model"
import type { ProductStatus } from "@shop/api/sdk"

/**
 * SKU 编码上限（字）：镜像契约 `SkuUpdateItem.skuCode`，落点 `product.skus.sku_code` 同宽。
 *
 * 建 SKU 与编辑 SKU 两个表单此前各写一遍 `maxLength={64}`，商家自己打印的条码标签按 64 位刻，
 * 两处一旦不同就会出现「这里存得下、那里存不下」。与类目名 64、承运商名 50 等撞数常量刻意不合并：
 * 上限直接取生成的 SkuUpdateItem 契约，Java 注解与列宽仍由 FieldRuleVocabularyTest 核对。
 */
export const SKU_CODE_MAX = SkuUpdateItemSchema.properties.skuCode.maxLength

/** 状态名的 catalog key 子集：`seller.product.status.<码>`，写错键即编译错 */
type ProductStatusKey = Extract<SellerMessageKey, `seller.product.status.${string}`>

/**
 * 商品状态：徽章句（键）与徽章色一张表，页签/下拉从这里派生（一处改键，全站跟着走）。
 * §4.1：句子进 seller catalog，common 不承载用户可见文案。
 */
export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    { labelKey: ProductStatusKey; variant: "success" | "secondary" | "outline" }
> = {
    PUBLISHED: { labelKey: "seller.product.status.PUBLISHED", variant: "success" },
    WAREHOUSE: { labelKey: "seller.product.status.WAREHOUSE", variant: "secondary" },
    DRAFT: { labelKey: "seller.product.status.DRAFT", variant: "outline" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<
    KeyedStatusOption<ProductStatus, ProductStatusKey>
> = statusOptionsFromKeys(PRODUCT_STATUS_META)

/**
 * 「编辑 SKU / 编辑库存」两个弹窗共用一套骨架，只差在标题、提示语和成功文案。
 * 纯展示表：弹窗按 kind 取一行，不再自己持一份。
 */
export const SKU_EDIT_KIND_META: Record<
    SkuEditKind,
    { title: string; notice: string; okMessage: LocalizedText }
> = {
    price: {
        title: "编辑 SKU",
        notice: "库存调整请点库存列进入「编辑库存」，此处只调整价格与商家编码。",
        okMessage: { key: "seller.product.toast.skuOkPrice" },
    },
    stock: {
        title: "编辑库存",
        notice: "价格调整请点价格列进入「编辑 SKU」，此处只调整库存。",
        okMessage: { key: "seller.product.toast.skuOkStock" },
    },
}
