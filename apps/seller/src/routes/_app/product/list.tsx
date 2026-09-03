import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

import { toApiError } from "@shop/api"
import type { ProductResponse } from "@shop/api/sdk"

import { ProductTable } from "#/products/list/table"
import { FilterBar, type ProductListFilter, type ProductStatusFilter } from "#/products/list/filter"
import { listProducts, offProduct, onProduct } from "#/products/data"
import { useCurrentShop } from "#/shared/lib/shop"

// ---------- URL search 校验（筛选/分页都进 URL，刷新/分享可恢复） ----------

interface ProductListSearch {
    status?: ProductStatusFilter
    keyword?: string
    page: number
    size: number
}

export const Route = createFileRoute("/_app/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductListSearch => ({
        // 状态页签默认「在售」，与 FilterBar 默认一致；只有显式无效值才回落 undefined
        status:
            search.status === "PUBLISHED" ||
            search.status === "WAREHOUSE" ||
            search.status === "DRAFT"
                ? search.status
                : "PUBLISHED",
        keyword: typeof search.keyword === "string" && search.keyword ? search.keyword : undefined,
        page: Number(search.page) || 1,
        size: Number(search.size) || 10,
    }),
    component: ProductsPage,
})

/** 商品列表容器：持有 URL search + 查询 + 行内变更，组装 FilterBar 与 ProductTable */
function ProductsPage() {
    const shop = useCurrentShop()
    const search = Route.useSearch()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [busyId, setBusyId] = useState<string | undefined>()

    const shopId = shop?.id
    const queryKey = useCallback(
        (s: ProductListSearch) =>
            ["products", shopId, s.status ?? "all", s.keyword ?? "", s.page, s.size] as const,
        [shopId],
    )

    const products = useQuery({
        queryKey: queryKey(search),
        queryFn: () =>
            listProducts(shopId!, {
                page: search.page,
                size: search.size,
                status: search.status,
                keyword: search.keyword,
            }),
        enabled: !!shopId,
        placeholderData: (prev) => prev,
    })

    // 筛选/分页变更 → 统一写回 URL；筛选或切 Tab 时重置回第 1 页
    function apply(next: Partial<ProductListSearch>) {
        void navigate({
            to: "/product/list",
            search: {
                status: search.status,
                keyword: search.keyword,
                page: search.page,
                size: search.size,
                ...next,
                ...(next.status !== undefined || next.keyword !== undefined ? { page: 1 } : {}),
            },
        })
    }

    // 下架/上架：DRY 的变更包装，执行后失效 query 并复位 busyId
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products", shopId] })

    const off = useMutation({
        mutationFn: (id: string) => offProduct(shopId!, id),
        onSuccess: invalidate,
    })
    const on = useMutation({
        mutationFn: (id: string) => onProduct(shopId!, id),
        onSuccess: invalidate,
    })

    // 供行内按钮调用：setBusyId + mutateAsync（返回 promise，finally 复位 busyId）
    const handleAction = useCallback(
        (mutateAsync: (id: string) => Promise<unknown>) => (id: string) => {
            setBusyId(id)
            mutateAsync(id).finally(() => setBusyId(undefined))
        },
        [],
    )
    const handleOff = handleAction(off.mutateAsync)
    const handleOn = handleAction(on.mutateAsync)

    const records: ProductResponse[] = products.data?.records ?? []
    const total = products.data?.total ?? 0

    // 编辑：跳发布页回显（categoryId + productId 都在商品上，直接带入）。
    // 无论草稿/仓库中/已发布，编辑都按「商品 id」回显——状态只是商品属性，不改变回显方式。
    const handleEdit = useCallback(
        (id: string) => {
            const product = records.find((r) => r.id === id)
            if (!product) return
            void navigate({
                to: "/product/create/basic",
                search: { categoryId: product.categoryId, productId: product.id },
            })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [records, navigate],
    )

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
                value={
                    {
                        status: search.status ?? "PUBLISHED",
                        title: search.keyword ?? "",
                    } as ProductListFilter
                }
                onChange={(next) => apply({ status: next.status, keyword: next.title })}
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
                    onPageChange={(page) => apply({ page })}
                />
            )}
        </div>
    )
}
