import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type NavigateOptions } from "@tanstack/react-router"
import type { ProductResponse } from "@shop/api/sdk"
import { ProductsAdminApi } from "@shop/api/sdk"

import type { ProductStatusFilter } from "#/products/constants"
import type { ProductListFilter } from "#/products/list/filter"
import { productKeys, productListOptions, type ProductListSearch } from "#/products/queries"
import { useCurrentShop } from "#/shared/lib/shop"

export type { ProductListSearch }

type NavigateFn = (opts: NavigateOptions) => Promise<unknown> | void

export function useProductList(search: ProductListSearch, navigate: NavigateFn) {
    const shop = useCurrentShop()
    const queryClient = useQueryClient()
    const [busyId, setBusyId] = useState<string | undefined>()

    const shopId = shop?.id

    const products = useQuery(productListOptions(shopId, search))

    const apply = useCallback(
        (next: Partial<ProductListSearch>) => {
            void navigate({
                to: "/product/list",
                search: {
                    status: search.status,
                    keyword: search.keyword,
                    page: search.page,
                    size: search.size,
                    ...next,
                    ...(next.status !== undefined || next.keyword !== undefined ? { page: 1 } : {}),
                } as ProductListSearch,
            })
        },
        [navigate, search],
    )

    const invalidate = useCallback(
        () => queryClient.invalidateQueries({ queryKey: productKeys.lists(shopId) }),
        [queryClient, shopId],
    )

    const off = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.offProduct({ path: { id } }),
        onSuccess: invalidate,
    })
    const on = useMutation({
        mutationFn: (id: string) => ProductsAdminApi.onProduct({ path: { id } }),
        onSuccess: invalidate,
    })

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

    const filterValue: ProductListFilter = {
        status: (search.status ?? "PUBLISHED") as ProductStatusFilter,
        title: search.keyword ?? "",
    }

    const handleFilterChange = useCallback(
        (next: ProductListFilter) => apply({ status: next.status, keyword: next.title }),
        [apply],
    )

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
