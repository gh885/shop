import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
import { toApiError } from "@shop/api"
import { z } from "zod"

import { ProductTable } from "#/products/list/table"
import { FilterBar } from "#/products/list/filter"
import { useProductList, type ProductListSearch } from "#/products/list/use-product-list"

// status 从生成的 ProductStatus 枚举派生（后端加状态时此处编译期跟进），脏值 catch 到默认 tab
const listSearchSchema = z.object({
    status: z.enum(ProductStatus).catch("PUBLISHED"),
    keyword: z.string().min(1).optional().catch(undefined),
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
    const navigate = useNavigate()
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
    } = useProductList(search, navigate as never)

    if (!shop) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Store className="size-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                    还没有正常营业的店铺，先到「店铺管理」创建或等待审核
                </p>
            </div>
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
                <Empty className="rounded-2xl border-border py-16">
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
                    onEdit={handleEdit}
                    onOff={handleOff}
                    onOn={handleOn}
                    onPageChange={onPageChange}
                />
            )}
        </div>
    )
}
