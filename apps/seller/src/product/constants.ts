import type { ProductStatus } from "@shop/api/sdk"

export const PRODUCT_STATUS_META: Record<
    ProductStatus,
    { label: string; variant: "default" | "secondary" | "outline" }
> = {
    PUBLISHED: { label: "上架中", variant: "default" },
    WAREHOUSE: { label: "仓库中", variant: "secondary" },
    DRAFT: { label: "草稿", variant: "outline" },
}

export const PRODUCT_STATUS_TABS: ReadonlyArray<{ value: ProductStatus; label: string }> = [
    { value: "PUBLISHED", label: "在售" },
    { value: "WAREHOUSE", label: "仓库中" },
    { value: "DRAFT", label: "草稿" },
]
