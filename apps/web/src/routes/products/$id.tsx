import { useMemo, useState } from "react"
import { createFileRoute, notFound } from "@tanstack/react-router"

import { toApiError } from "@shop/api"

import type { ProductDetail } from "#/entities/product"
import { productDetailOptions, shopOptions } from "#/features/product-detail/use-product-detail"
import { useSkuSelection } from "#/features/product-detail/use-sku-selection"
import { DescriptionSection } from "#/widgets/product-detail/description-section"
import { DetailColumns } from "#/shared/ui/detail-columns"
import { DetailHeader } from "#/widgets/product-detail/detail-header"
import { DetailSectionTabs } from "#/widgets/product-detail/detail-section-tabs"
import { Gallery } from "#/widgets/product-detail/gallery"
import { ParamsSection } from "#/widgets/product-detail/params-section"
import { PurchaseCta } from "#/widgets/product-detail/purchase-cta"
import { PurchasePanel } from "#/widgets/product-detail/purchase-panel"
import {
    AlsoViewedSection,
    ShopRecommendSection,
} from "#/widgets/product-detail/recommend-sections"
import { ReviewsSection } from "#/widgets/product-detail/reviews-section"
import { ShopBar } from "#/widgets/product-detail/shop-bar"

export const Route = createFileRoute("/products/$id")({
    /**
     * SSR 预取：详情先行（404 直接 notFound），店铺信息依赖 detail.shopId 只能串行；
     * 店铺失败不拖垮页面（店条回退字母头像），详情失败才致命。
     */
    loader: async ({ context, params }) => {
        let detail: ProductDetail
        try {
            detail = await context.queryClient.ensureQueryData(productDetailOptions(params.id))
        } catch (error) {
            // 详情不存在/非上架由后端 404；数据层已把错误归一化为 ApiError
            if (toApiError(error).status === 404) throw notFound()
            throw error
        }
        await context.queryClient
            .ensureQueryData(shopOptions(detail.product.shopId))
            .catch(() => {})
        return { detail }
    },
    component: ProductDetailPage,
    head: ({ match }) => ({
        meta: [
            {
                title: `${(match.loaderData as { detail?: ProductDetail } | undefined)?.detail?.product.title ?? "商品详情"} - Shop`,
            },
        ],
    }),
})

function ProductDetailPage() {
    const { detail } = Route.useLoaderData() as { detail: ProductDetail }
    const sel = useSkuSelection(detail)
    // 加购数量：与规格选中态一样由 route 持有，购买区步进器与 CTA 加购共用
    const [quantity, setQuantity] = useState(1)

    // 画廊图序：选中 SKU 有专属图时置顶（主图跟随规格切换），去重后供画廊以 URL 作键
    const images = useMemo(() => {
        const base =
            detail.images.length > 0
                ? detail.images
                : [detail.product.image].filter((i) => i !== "")
        const merged = sel.matchedSku?.image
            ? [sel.matchedSku.image, ...base.filter((i) => i !== sel.matchedSku?.image)]
            : base
        return [...new Set(merged)]
    }, [detail, sel.matchedSku])

    return (
        <div>
            <DetailHeader />
            <div className="mx-auto w-full max-w-[1486px] px-6 pb-10">
                {/* 左滚右停：左栏（店铺条+画廊+描述）随滚动，右栏购买区钉住 */}
                <DetailColumns
                    left={
                        <>
                            {/* 左栏头部：店铺条 */}
                            <section className="rounded-2xl bg-background p-6 pb-0">
                                <ShopBar shopId={detail.product.shopId} />
                            </section>
                            <section className="mt-5 rounded-2xl bg-background p-6 pt-0">
                                <Gallery
                                    images={images}
                                    params={detail.params}
                                />
                            </section>
                            {/* 吸顶锚点导航 + 五个区块（点击 tab 平滑滚动到对应位置） */}
                            <DetailSectionTabs />
                            <ReviewsSection />
                            <ParamsSection params={detail.params} />
                            <DescriptionSection detail={detail} />
                            <ShopRecommendSection detail={detail} />
                            <AlsoViewedSection detail={detail} />
                        </>
                    }
                    right={
                        <section className="rounded-2xl bg-background p-6">
                            <PurchasePanel
                                detail={detail}
                                selection={sel.selection}
                                select={sel.select}
                                isAvailable={sel.isAvailable}
                                quantity={quantity}
                                onQuantityChange={setQuantity}
                            />
                        </section>
                    }
                    bottom={
                        <PurchaseCta
                            detail={detail}
                            selection={sel.selection}
                            quantity={quantity}
                        />
                    }
                />
            </div>
        </div>
    )
}
