import { createFileRoute, Link } from "@tanstack/react-router"
import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    DataTableSkeleton,
} from "@shop/ui-web"
import { Package, Plus } from "lucide-react"

import { useState } from "react"

import { ProductTable, type ProductLineTarget } from "#/domains/product/list/table"
import { useT } from "#/locales/use-t"
import { EditSkuLineDialog } from "#/domains/product/list/EditSkuDialog"
import type { SkuEditKind } from "#/domains/product/draft-rules"
import { EditTitleDialog } from "#/domains/product/list/EditTitleDialog"
import { FilterBar } from "#/domains/product/list/filter"
import { useProductList } from "#/domains/product/list/use-product-list"
import { productListSearchSchema, type ProductListSearch } from "#/domains/product/search"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_authenticated/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductListSearch =>
        productListSearchSchema.parse(search),
    component: ProductsPage,
})

function ProductsPage() {
    const search = Route.useSearch()
    const shop = useShop()
    const t = useT("product")
    const {
        products,
        records,
        nextCursor,
        busyId,
        filterValue,
        handleFilterChange,
        handleOff,
        handleRelist,
        handleSaved,
        onLoadMore,
    } = useProductList(shop.id, search)

    const [skuTarget, setSkuTarget] = useState<
        { product: ProductLineTarget; kind: SkuEditKind } | undefined
    >(undefined)
    const [titleTarget, setTitleTarget] = useState<ProductLineTarget | undefined>()

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">{t("product.list.title")}</h1>
                <Button
                    render={
                        <Link
                            to="/product/create/category"
                            search={{}}
                        />
                    }
                >
                    <Plus className="size-4" />
                    {t("product.list.action.create")}
                </Button>
            </div>

            <FilterBar
                value={filterValue}
                onChange={handleFilterChange}
            />

            {products.isPending ? (
                <DataTableSkeleton columns={7} />
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
                    nextCursor={nextCursor ?? undefined}
                    busyId={busyId}
                    onEditTitle={setTitleTarget}
                    onEditSku={(p) => setSkuTarget({ product: p, kind: "price" })}
                    onOff={handleOff}
                    onRelist={handleRelist}
                    onLoadMore={onLoadMore}
                />
            )}

            <EditSkuLineDialog
                open={Boolean(skuTarget)}
                kind={skuTarget?.kind ?? "price"}
                productId={skuTarget?.product.spuId}
                productName={skuTarget?.product.title}
                onOpenChange={(open) => !open && setSkuTarget(undefined)}
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
