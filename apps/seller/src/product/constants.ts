import { statusOptions } from "@shop/common"

import type { ProductStatus } from "@shop/api/sdk"

/**
 * SKU 编码上限（字）：镜像契约 `SkuUpdateItem.skuCode`，落点 `product.skus.sku_code` 同宽。
 *
 * 建 SKU 与编辑 SKU 两个表单此前各写一遍 `maxLength={64}`，商家自己打印的条码标签按 64 位刻，
 * 两处一旦不同就会出现「这里存得下、那里存不下」。与类目名 64、承运商名 50 等撞数常量刻意不合并：
 * 等值关系由 apps/server 的 FieldRuleVocabularyTest 镜像表按概念核对。
 */
export const SKU_CODE_MAX = 64

/** 商品状态：文案与徽章色一张表，页签/下拉从这里派生（一处改词，全站跟着改） */
export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    { label: string; variant: "success" | "secondary" | "outline" }
> = {
    PUBLISHED: { label: "上架中", variant: "success" },
    WAREHOUSE: { label: "仓库中", variant: "secondary" },
    DRAFT: { label: "草稿", variant: "outline" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<{ value: ProductStatus; label: string }> =
    statusOptions(PRODUCT_STATUS_META)
