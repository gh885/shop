import type { ProductResponse } from "@shop/api/sdk"
import { ProductsAdminApi } from "@shop/api/sdk"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import type { ProductListFilter } from "#/product/list/filter"
import { productKeys, productListOptions, type ProductSort } from "#/product/queries"
import type { ProductListSearch } from "#/product/queries"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import { useWriteMutation } from "#/shared/lib/use-write-mutation"
import { useCurrentShop } from "#/shop"

export type { ProductListSearch } from "#/product/queries"

export function useProductList(search: ProductListSearch) {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { busyId, run } = useRowBusy()

    const shopId = shop?.id
    const products = useQuery(productListOptions(shopId, search))

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    function apply(next: Partial<ProductListSearch>) {
        void navigate({
            to: "/product/list",
            search: {
                status: search.status,
                keyword: search.keyword,
                sort: search.sort,
                page: search.page,
                size: search.size,
                ...next,
                ...(next.status !== undefined ||
                next.keyword !== undefined ||
                next.sort !== undefined
                    ? { page: 1 }
                    : {}),
            },
        })
    }

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: productKeys.lists(shopId) })
    }

    const off = useWriteMutation<string>({
        mutationFn: (id) => ProductsAdminApi.offProduct({ path: { id } }),
        invalidate,
        messages: { success: "商品已下架", error: "下架失败" },
    })
    const on = useWriteMutation<string>({
        mutationFn: (id) => ProductsAdminApi.onProduct({ path: { id } }),
        invalidate,
        messages: { success: "商品已上架", error: "上架失败" },
    })

    const records: ProductResponse[] = products.data?.records ?? []

    function handleEdit(id: string) {
        const product = records.find((r) => r.id === id)
        if (!product) return
        void navigate({
            to: "/product/create/basic",
            search: { categoryId: product.categoryId, productId: product.id },
        })
    }

    const filterValue: ProductListFilter = {
        status: search.status ?? "PUBLISHED",
        title: search.keyword ?? "",
    }

    return {
        shop,
        products,
        records,
        total: products.data?.total ?? 0,
        busyId,
        filterValue,
        handleFilterChange: (next: ProductListFilter) =>
            apply({ status: next.status, keyword: next.title }),
        handleEdit,
        handleOff: run(off.mutateAsync),
        handleOn: run(on.mutateAsync),
        onPageChange: (page: number) => apply({ page }),
        onSortChange: (sort: ProductSort) => apply({ sort }),
    }
}
