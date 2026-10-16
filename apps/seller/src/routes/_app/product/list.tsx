import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    DataTableSkeleton,
} from "@shop/ui-web"
import { Package } from "lucide-react"

import { ProductStatus } from "@shop/api/sdk"
import { paginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

import { useState } from "react"

import { ProductTable, type ProductLineTarget, type ProductTitleTarget } from "#/product/list/table"
import { useT } from "#/locales/use-t"
import { EditSkuLineDialog } from "#/product/list/EditSkuDialog"
import type { SkuEditKind } from "#/product/draft-model"
import { EditTitleDialog } from "#/product/list/EditTitleDialog"
import { FilterBar } from "#/product/list/filter"
import { useProductList, type ProductListSearch } from "#/product/list/use-product-list"
import { PRODUCT_SORTS } from "#/product/queries"
import { useShop } from "#/shop"

const listSearchSchema = paginationSearchSchema.extend({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(ProductStatus).catch("PUBLISHED"),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    keyword: z.string().min(1).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    sort: z.enum(PRODUCT_SORTS).optional().catch(undefined),
})

export const Route = createFileRoute("/_app/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductListSearch =>
        listSearchSchema.parse(search),
    component: ProductsPage,
})

// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 商品列表页：搜索参数 + 列表 + 分页 + 行操作集中在页面是刻意结构，逻辑（查询/派生）全在域内；拆分需传 7+ props 的宽接口
function ProductsPage() {
    const search = Route.useSearch()
    const shop = useShop()
    const t = useT("product")
    const {
        products,
        records,
        total,
        busyId,
        filterValue,
        handleFilterChange,
        handleEdit,
        handleOff,
        handleOn,
        handleSaved,
        onPageChange,
        onSortChange,
    } = useProductList(shop.id, search)

    const [lineTarget, setLineTarget] = useState<
        { product: ProductLineTarget; kind: SkuEditKind } | undefined
    >(undefined)
    const [titleTarget, setTitleTarget] = useState<ProductTitleTarget | undefined>()

    return (
        <div className="space-y-5">
            <FilterBar
                value={filterValue}
                onChange={handleFilterChange}
            />

            {products.isPending ? (
                <DataTableSkeleton columns={6} />
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Package />
                        </EmptyMedia>
                        <EmptyTitle>
                            {search.keyword || search.status
                                ? t("product.list.empty.filtered.title")
                                : t("product.list.empty.initial.title")}
                        </EmptyTitle>
                        <EmptyDescription>
                            {search.keyword || search.status
                                ? t("product.list.empty.filtered.body")
                                : t("product.list.empty.initial.body")}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <ProductTable
                    rows={records}
                    page={search.page}
                    pageSize={search.size}
                    total={total}
                    busyId={busyId}
                    sort={search.sort}
                    onEdit={handleEdit}
                    onEditTitle={setTitleTarget}
                    onEditPrice={(p) => setLineTarget({ product: p, kind: "price" })}
                    onEditStock={(p) => setLineTarget({ product: p, kind: "stock" })}
                    onOff={handleOff}
                    onOn={handleOn}
                    onPageChange={onPageChange}
                    onSortChange={onSortChange}
                />
            )}

            <EditSkuLineDialog
                open={Boolean(lineTarget)}
                kind={lineTarget?.kind ?? "price"}
                productId={lineTarget?.product.id}
                productName={lineTarget?.product.name}
                onOpenChange={(open) => !open && setLineTarget(undefined)}
                onSaved={handleSaved}
            />

            <EditTitleDialog
                open={Boolean(titleTarget)}
                product={titleTarget}
                onOpenChange={(open) => !open && setTitleTarget(undefined)}
                onSaved={handleSaved}
            />
        </div>
    )
}
