import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { Package, Store } from "lucide-react"

import { ProductStatus } from "@shop/api/sdk"
import { toApiError } from "@shop/common"
import { z } from "zod"

import { useState } from "react"
import type { ProductResponse } from "@shop/api/sdk"

import { ProductTable } from "#/product/list/table"
import { EditSkuLineDialog, type SkuEditKind } from "#/product/list/EditSkuDialog"
import { EditTitleDialog } from "#/product/list/EditTitleDialog"
import { FilterBar } from "#/product/list/filter"
import { useProductList, type ProductListSearch } from "#/product/list/use-product-list"
import { PRODUCT_SORTS } from "#/product/queries"

// status 从生成的 ProductStatus 枚举派生（后端加状态时此处编译期跟进），脏值 catch 到默认 tab
const listSearchSchema = z.object({
    status: z.enum(ProductStatus).catch("PUBLISHED"),
    keyword: z.string().min(1).optional().catch(undefined),
    sort: z.enum(PRODUCT_SORTS).optional().catch(undefined),
    page: z.coerce.number().int().min(1).catch(1),
    size: z.coerce.number().int().min(1).catch(10),
})

export const Route = createFileRoute("/_app/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductListSearch =>
        listSearchSchema.parse(search),
    component: ProductsPage,
})

function ProductsPage() {
    const search = Route.useSearch()
    const {
        shop,
        products,
        records,
        total,
        busyId,
        filterValue,
        handleFilterChange,
        handleEdit,
        handleOff,
        handleOn,
        onPageChange,
        onSortChange,
    } = useProductList(search)

    // 编辑SKU/库存弹窗目标：记录当前行商品（只用 id + name）+ 当前编辑维度（价格/库存）
    const [lineTarget, setLineTarget] = useState<
        { product: ProductResponse; kind: SkuEditKind } | undefined
    >(undefined)
    // 编辑标题弹窗目标：直接用行内 name/subtitle 预填，无需再拉详情
    const [titleTarget, setTitleTarget] = useState<ProductResponse | undefined>()

    if (!shop) {
        return (
            <Empty className="py-24">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Store />
                    </EmptyMedia>
                    <EmptyTitle>还没有正常营业的店铺</EmptyTitle>
                    <EmptyDescription>先到「店铺管理」创建店铺或等待审核通过。</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="space-y-5">
            <FilterBar
                value={filterValue}
                onChange={handleFilterChange}
            />

            {products.isError ? (
                <StateError
                    message={toApiError(products.error).detail}
                    onRetry={() => void products.refetch()}
                    retrying={products.isFetching}
                />
            ) : products.isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full rounded-xl"
                        />
                    ))}
                </div>
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Package />
                        </EmptyMedia>
                        <EmptyTitle>
                            {search.keyword || search.status ? "没有符合条件的商品" : "还没有商品"}
                        </EmptyTitle>
                        <EmptyDescription>
                            {search.keyword || search.status
                                ? "换个筛选条件试试"
                                : "点右上角「新建商品」开始"}
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
                onSaved={() => void products.refetch()}
            />

            <EditTitleDialog
                open={Boolean(titleTarget)}
                product={titleTarget}
                onOpenChange={(open) => !open && setTitleTarget(undefined)}
                onSaved={() => void products.refetch()}
            />
        </div>
    )
}
