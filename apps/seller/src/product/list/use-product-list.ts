import { productKeys, productListOptions } from "#/products/queries"
import type { ProductListSearch } from "#/products/queries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { ProductResponse } from "@shop/api/sdk"
import { ProductsAdminApi } from "@shop/api/sdk"

import type { ProductListFilter } from "#/products/list/filter"

import { useCurrentShop } from "#/shared/lib/shop"
import { useState } from "react"
import { notify } from "@shop/app-kit"

export type { ProductListSearch } from "#/products/queries"

export function useProductList(search: ProductListSearch) {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [busyId, setBusyId] = useState<string | undefined>()

    const shopId = shop?.id

    const products = useQuery(productListOptions(shopId, search))

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
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

    function invalidate() {
        return queryClient.invalidateQueries({ queryKey: productKeys.lists(shopId) })
    }

    const off = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.offProduct({ path: { id } }),
        onSuccess: () => {
            notify.success("商品已下架")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "下架失败"),
    })
    const on = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.onProduct({ path: { id } }),
        onSuccess: () => {
            notify.success("商品已上架")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "上架失败"),
    })

    function handleAction(mutateAsync: (id: string) => Promise<unknown>) {
        return (id: string) => {
            setBusyId(id)
            // 错误已在 mutation 的 onError 里 toast，这里 catch 只为吞掉 unhandled rejection
            mutateAsync(id)
                .catch(() => undefined)
                .finally(() => setBusyId(undefined))
        }
    }
    const handleOff = handleAction(off.mutateAsync)
    const handleOn = handleAction(on.mutateAsync)

    const records: ProductResponse[] = products.data?.records ?? []
    const total = products.data?.total ?? 0

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

    function handleFilterChange(next: ProductListFilter) {
        apply({ status: next.status, keyword: next.title })
    }

    return {
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
        onPageChange: (page: number) => apply({ page }),
    }
}
