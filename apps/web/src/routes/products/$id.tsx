import { localizePathname } from "#/shared/lib/locale-url"
import { toApiError } from "@shop/common/contract"
import { lazy, Suspense, useState } from "react"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"

import { cn } from "@shop/ui-web"

import type { ProductDetail } from "#/products"
import {
    AlsoViewedSection,
    DETAIL_LAYOUT,
    DetailHeader,
    DetailSections,
    ProductDetailSkeleton,
    productDetailOptions,
    PurchaseCta,
    PurchasePanel,
    shopOptions,
    ShopBar,
    ShopRecommendSection,
    type SkuSearch,
    type SkuSearchInput,
    skuSearchSchema,
    useSkuSelection,
} from "#/products/detail"
import { galleryImages } from "#/products/detail/gallery-images"
import { productSeo } from "#/products/detail/seo"
import { clampPurchaseQuantity } from "#/products/detail/purchase-quantity"
import { DetailColumns } from "#/shared/ui/DetailColumns"
import { SITE_ORIGIN } from "#/shared/lib/env"

const Gallery = lazy(() =>
    import("#/products/detail/Gallery").then((module) => ({ default: module.Gallery })),
)

export const Route = createFileRoute("/products/$id")({
    validateSearch: (search: SkuSearchInput): SkuSearch => skuSearchSchema.parse(search),
    loader: async ({ context, params }) => {
        let detail: ProductDetail
        try {
            detail = await context.queryClient.query({
                ...productDetailOptions(params.id),
                staleTime: "static",
            })
        } catch (error) {
            if (toApiError(error).status === 404) throw notFound()
            throw error
        }
        await context.queryClient
            .query({ ...shopOptions(detail.product.shopId), staleTime: "static" })
            .catch(() => {})
        return { detail }
    },
    component: ProductDetailPage,
    pendingComponent: ProductDetailSkeleton,
    head: ({ match }) => {
        // canonical 取 match.pathname（不含查询串）：规格选择进了 URL，?spec=... 会产生大量等价副本，
        // 全部收敛到一个权威地址；也不依赖 loaderData，加载失败/降级时不会拼出 /products/undefined
        const canonical = `${SITE_ORIGIN}${localizePathname(match.pathname, match.context.locale)}`
        return productSeo(match.loaderData?.detail, canonical, match.context.locale)
    },
})

function ProductDetailPage() {
    const { detail } = Route.useLoaderData()
    const search = Route.useSearch()
    const navigate = useNavigate({ from: Route.fullPath })

    const sel = useSkuSelection({
        detail,
        spec: search.spec ?? {},
        onSpecChange: (spec, options) => {
            void navigate({
                search: Object.keys(spec).length > 0 ? { spec } : {},
                replace: options.replace,
                resetScroll: false,
            })
        },
    })

    const [quantity, setQuantity] = useState(1)
    const effectiveQuantity = clampPurchaseQuantity(quantity, sel.matchedSku?.stock)

    const images = galleryImages({
        images: detail.images,
        productImage: detail.product.image,
        skuImage: sel.matchedSku?.image,
    })

    return (
        <div>
            <DetailHeader />
            <div className={cn("mx-auto w-full px-6 pb-10", DETAIL_LAYOUT.container)}>
                <DetailColumns
                    rightWidth={DETAIL_LAYOUT.rightWidth}
                    gapClassName={DETAIL_LAYOUT.gap}
                    left={
                        <>
                            <section className="mb-4 h-13.5">
                                <ShopBar shopId={detail.product.shopId} />
                            </section>
                            <Suspense
                                fallback={
                                    <div className="aspect-square w-full rounded-lg bg-muted lg:aspect-auto lg:h-141" />
                                }
                            >
                                <Gallery
                                    images={images}
                                    params={detail.params}
                                />
                            </Suspense>
                            <DetailSections detail={detail} />
                            <ShopRecommendSection detail={detail} />
                        </>
                    }
                    right={
                        <div
                            className={cn(
                                "flex flex-col",
                                "lg:sticky",
                                DETAIL_LAYOUT.stickyTop,
                                DETAIL_LAYOUT.minHeight,
                            )}
                        >
                            <section className="rounded-lg bg-background px-6 py-2">
                                <PurchasePanel
                                    detail={detail}
                                    selection={sel.selection}
                                    select={sel.select}
                                    isAvailable={sel.isAvailable}
                                    quantity={effectiveQuantity}
                                    onQuantityChange={setQuantity}
                                />
                            </section>
                            <div className="mt-auto pt-3 lg:sticky lg:bottom-4">
                                <PurchaseCta
                                    detail={detail}
                                    selection={sel.selection}
                                    quantity={effectiveQuantity}
                                />
                            </div>
                        </div>
                    }
                />
                <AlsoViewedSection detail={detail} />
            </div>
        </div>
    )
}
