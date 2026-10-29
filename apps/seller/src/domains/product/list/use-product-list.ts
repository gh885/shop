import { message } from "#/locales/message"
import { SellerProductEditControllerApi } from "@shop/api/sdk"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import type { ProductListFilter } from "#/domains/product/list/filter"
import { productKeys, productListOptions } from "#/domains/product/queries"
import type { ProductListSearch } from "#/domains/product/search"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export type { ProductListSearch } from "#/domains/product/search"

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
                cursor: search.cursor,
                size: search.size,
                ...next,
                // 换筛选（状态 / 关键词）丢掉游标：拿着上一页游标看新筛选毫无意义
                ...(next.status !== undefined || next.keyword !== undefined
                    ? { cursor: undefined }
                    : {}),
            },
            replace,
        })
    }

    // 上下架（meta.invalidates）与弹窗保存（onSaved）共用本店 listKey
    const listKey = productKeys.lists(shopId)

    const off = useMutation({
        mutationFn: (spuId: string) =>
            SellerProductEditControllerApi.offlineProduct({ path: { spuId } }),
        meta: {
            success: message("product.toast.offShelf"),
            error: message("product.toast.offShelfFailed"),
            invalidates: [listKey],
        },
    })
    const relist = useMutation({
        mutationFn: (spuId: string) => SellerProductEditControllerApi.relist({ path: { spuId } }),
        meta: {
            success: message("product.toast.onShelf"),
            error: message("product.toast.onShelfFailed"),
            invalidates: [listKey],
        },
    })

    const records = products.data?.items ?? []

    const filterValue: ProductListFilter = {
        status: search.status ?? "online",
        title: search.keyword ?? "",
    }

    return {
        products,
        records,
        nextCursor: products.data?.nextCursor,
        counts: products.data?.counts,
        busyId,
        filterValue,
        handleFilterChange: (next: ProductListFilter) =>
            apply({ status: next.status, keyword: next.title }),
        handleOff: run(off.mutateAsync),
        handleRelist: run(relist.mutateAsync),
        // 失效本店 listKey（与上下架同 key），不用 products.refetch()（绕过 staleTime、且失效范围会随列表结构漂走）
        handleSaved: () => void queryClient.invalidateQueries({ queryKey: listKey }),
        onLoadMore: () => apply({ cursor: products.data?.nextCursor }),
    }
}
