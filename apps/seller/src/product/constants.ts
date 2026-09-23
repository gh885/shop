import { statusOptions } from "@shop/common"

import type { ProductStatus } from "@shop/api/sdk"

/** 商品状态：文案与徽章色一张表，页签/下拉从这里派生（一处改词，全站跟着改） */
export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    { label: string; variant: "default" | "secondary" | "outline" }
> = {
    PUBLISHED: { label: "上架中", variant: "default" },
    WAREHOUSE: { label: "仓库中", variant: "secondary" },
    DRAFT: { label: "草稿", variant: "outline" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<{ value: ProductStatus; label: string }> =
    statusOptions(PRODUCT_STATUS_META)
