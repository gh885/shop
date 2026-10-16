import { message } from "#/locales/message"
import type { ProductResponse } from "@shop/api/sdk"
import { ProductsAdminApi } from "@shop/api/sdk"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useOutOfRangePageGuard } from "@shop/app-kit/data"

import type { ProductListFilter } from "#/product/list/filter"
import { productKeys, productListOptions, type ProductSort } from "#/product/queries"
import type { ProductListSearch } from "#/product/queries"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export type { ProductListSearch } from "#/product/queries"

export function useProductList(shopId: string, search: ProductListSearch) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { busyId, run } = useRowBusy()
    const products = useQuery(productListOptions(shopId, search))

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    function apply(next: Partial<ProductListSearch>, replace = false) {
        void navigate({
            to: "/product/list",
            search: {
                status: search.status,
                keyword: search.keyword,
                sort: search.sort,
                page: search.page,
                size: search.size,
                ...next,
                // 换筛选（状态 / 关键词 / 排序）回到第 1 页：留在第 3 页看新筛选，大概率那页没有结果
                ...(next.status !== undefined ||
                next.keyword !== undefined ||
                next.sort !== undefined
                    ? { page: 1 }
                    : {}),
            },
            replace,
        })
    }

    // 越界页码收口：数据落定后才判（下架/换筛选会让列表收缩到那一页已不存在），修正不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: products.data?.total,
        size: search.size,
        onFix: (page) => apply({ page }, true),
    })

    // 上下架（meta.invalidates）与弹窗保存（onSaved）共用本店 listKey
    const listKey = productKeys.lists(shopId)

    const off = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.offProduct({ path: { id } }),
        meta: {
            success: message("product.toast.offShelf"),
            error: message("product.toast.offShelfFailed"),
            invalidates: [listKey],
        },
    })
    const on = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.onProduct({ path: { id } }),
        meta: {
            success: message("product.toast.onShelf"),
            error: message("product.toast.onShelfFailed"),
            invalidates: [listKey],
        },
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
        // 失效本店 listKey（与上下架同 key），不用 products.refetch()（绕过 staleTime、且失效范围会随列表结构漂走）
        handleSaved: () => void queryClient.invalidateQueries({ queryKey: listKey }),
        onPageChange: (page: number) => apply({ page }),
        onSortChange: (sort: ProductSort) => apply({ sort }),
    }
}
