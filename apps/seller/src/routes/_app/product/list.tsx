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
import { Package } from "lucide-react"

import { ProductStatus } from "@shop/api/sdk"
import { toApiError } from "@shop/common"
import { z } from "zod"

import { useState } from "react"

import { ProductTable, type ProductLineTarget, type ProductTitleTarget } from "#/product/list/table"
import { EditSkuLineDialog, type SkuEditKind } from "#/product/list/EditSkuDialog"
import { EditTitleDialog } from "#/product/list/EditTitleDialog"
import { FilterBar } from "#/product/list/filter"
import { useProductList, type ProductListSearch } from "#/product/list/use-product-list"
import { PRODUCT_SORTS } from "#/product/queries"
import { ShopRequired } from "#/shared/ui/ShopRequired"

// status 从生成的 ProductStatus 枚举派生（后端加状态时此处编译期跟进），脏值 catch 到默认 tab
const listSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(ProductStatus).catch("PUBLISHED"),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    keyword: z.string().min(1).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    sort: z.enum(PRODUCT_SORTS).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    page: z.coerce.number().int().min(1).catch(1),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    size: z.coerce.number().int().min(1).catch(10),
})

export const Route = createFileRoute("/_app/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductListSearch =>
        listSearchSchema.parse(search),
    component: ProductsPage,
})

// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 商品列表页：搜索参数 + 列表 + 分页 + 行操作集中在页面是刻意结构，逻辑（查询/派生）全在域内；拆分需传 7+ props 的宽接口
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
        handleSaved,
        onRetry,
        onPageChange,
        onSortChange,
    } = useProductList(search)

    // 编辑SKU/库存弹窗目标：记录当前行商品的 id + name（不背整行）与当前编辑维度（价格/库存）
    const [lineTarget, setLineTarget] = useState<
        { product: ProductLineTarget; kind: SkuEditKind } | undefined
    >(undefined)
    // 编辑标题弹窗目标：直接用行内 name/subtitle 预填，不拉详情，也不背整行
    const [titleTarget, setTitleTarget] = useState<ProductTitleTarget | undefined>()

    if (!shop) {
        return <ShopRequired />
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
                    onRetry={onRetry}
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
