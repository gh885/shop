import { statusOptions } from "@shop/common"

import type { SkuEditKind } from "./draft-model"
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

/**
 * 「编辑 SKU / 编辑库存」两个弹窗共用一套骨架，只差在标题、提示语和成功文案。
 * 纯展示表：弹窗按 kind 取一行，不再自己持一份。
 */
export const SKU_EDIT_KIND_META: Record<
    SkuEditKind,
    { title: string; notice: string; okMessage: string }
> = {
    price: {
        title: "编辑 SKU",
        notice: "库存调整请点库存列进入「编辑库存」，此处只调整价格与商家编码。",
        okMessage: "SKU 价格已更新",
    },
    stock: {
        title: "编辑库存",
        notice: "价格调整请点价格列进入「编辑 SKU」，此处只调整库存。",
        okMessage: "库存已更新",
    },
}
