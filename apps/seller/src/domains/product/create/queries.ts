import { queryOptions } from "@tanstack/react-query"
import { SellerBrandControllerApi, SellerCategoryControllerApi } from "@shop/api/sdk"
import type { BrandRow, CategoryConfig, CategoryTreeNode } from "@shop/api/sdk"

export const productCreateKeys = {
    all: ["product-create"] as const,
    tree: () => [...productCreateKeys.all, "tree"] as const,
    config: (categoryId: string) => [...productCreateKeys.all, "config", categoryId] as const,
    brands: () => [...productCreateKeys.all, "brands"] as const,
}

/** 卖家可见类目树：active + frozen；frozen 叶子的 mountable=false，前端据此禁用。 */
export const categoryTreeOptions = queryOptions<CategoryTreeNode[]>({
    queryKey: productCreateKeys.tree(),
    queryFn: ({ signal }) => SellerCategoryControllerApi.sellerTree({ signal }),
    staleTime: 60_000,
})

/** 叶子类目的属性模板。类目是第一步定的，进编辑器后不再变。 */
export const categoryConfigOptions = (categoryId: string) =>
    queryOptions<CategoryConfig>({
        queryKey: productCreateKeys.config(categoryId),
        queryFn: ({ signal }) =>
            SellerCategoryControllerApi.sellerCategoryConfig({ path: { categoryId }, signal }),
        retry: false,
        staleTime: 60_000,
    })

/** 只含 approved 的品牌。量小，一次拉完前端本地过滤。 */
export const brandOptions = queryOptions<BrandRow[]>({
    queryKey: productCreateKeys.brands(),
    queryFn: ({ signal }) => SellerBrandControllerApi.listApproved({ signal }),
    staleTime: 60_000,
})
