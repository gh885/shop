import { useMemo, useState } from "react"
import { createFileRoute, notFound } from "@tanstack/react-router"

import { toApiError } from "@shop/api"

import type { ProductDetail } from "#/entities/product"
import {
    AlsoViewedSection,
    DetailHeader,
    DetailSections,
    Gallery,
    productDetailOptions,
    PurchaseCta,
    PurchasePanel,
    shopOptions,
    ShopBar,
    ShopRecommendSection,
    useSkuSelection,
} from "#/widgets/product-detail"
import { DetailColumns } from "#/shared/ui/DetailColumns"

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
    head: ({ match }) => {
        const d = (match.loaderData as { detail?: ProductDetail } | undefined)?.detail
        const p = d?.product
        const price = p?.priceMin?.amount
        const ogImage = p?.image || d?.images?.[0]
        const meta: Array<
            | { title: string }
            | { property: string; content: string }
            | { name: string; content: string }
        > = [
            { title: `${p?.title ?? "商品详情"} - Shop` },
            // OpenGraph：SSR 直接写入 <head>，社交/搜索爬虫首帧即拿到（这是 SSR 相对 SPA 的硬收益）
            { property: "og:title", content: p?.title ?? "商品详情" },
            { property: "og:type", content: "product" },
            { property: "og:site_name", content: "Shop" },
            { name: "description", content: p?.subtitle || p?.title || "商品详情" },
        ]
        if (ogImage) meta.push({ property: "og:image", content: ogImage })
        return {
            meta,
            links: [
                // canonical：详情页 URL 唯一权威来源，避免带查询串/尺寸参数的分裂页被重复索引
                { rel: "canonical", href: `https://shop.example.com/products/${p?.id}` },
            ],
            scripts: [
                // JSON-LD Product 结构：价格/库存/图给搜索引擎与购物聚合，SPA 无法提供
                {
                    type: "application/ld+json",
                    children: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Product",
                        name: p?.title,
                        description: p?.subtitle,
                        image: ogImage ? [ogImage] : undefined,
                        sku: p?.id,
                        offers: price
                            ? {
                                  "@type": "Offer",
                                  price: (price / 100).toFixed(2),
                                  priceCurrency: p?.priceMin?.currency ?? "CNY",
                                  availability: "https://schema.org/InStock",
                              }
                            : undefined,
                    }),
                },
            ],
        }
    },
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
            <div className="mx-auto w-full max-w-(--container-page) px-6 pb-10">
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
                            {/* 吸顶锚点导航 + 评价/参数/图文详情 */}
                            <DetailSections detail={detail} />
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
