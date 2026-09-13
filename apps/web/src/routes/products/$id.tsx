import { fenToYuan, isContractViolation, toApiError } from "@shop/common"
import { useState } from "react"
import { createFileRoute, notFound } from "@tanstack/react-router"

import type { ProductDetail } from "#/products"
import {
    AlsoViewedSection,
    DETAIL_CONTAINER_CLASS,
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
} from "#/products/detail"
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
            // 详情不存在/非上架由后端 404；数据层已把错误归一化为 ApiError（status/detail）
            if (toApiError(error).status === 404) throw notFound()
            // 契约漂移：详情无法伪造合法形状兜底，生产降级为 notFound 页（dev 强抛）
            if (isContractViolation(error) && import.meta.env.PROD) throw notFound()
            throw error
        }
        await context.queryClient
            .ensureQueryData(shopOptions(detail.product.shopId))
            .catch(() => {})
        return { detail }
    },
    component: ProductDetailPage,
    head: ({ match }) => {
        const d = match.loaderData?.detail
        const p = d?.product
        const price = p?.priceMin.amount
        const ogImage = p?.image || d?.images[0]
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
                        offers:
                            p && price
                                ? {
                                      "@type": "Offer",
                                      price: fenToYuan(price),
                                      priceCurrency: p.priceMin.currency,
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
    const { detail } = Route.useLoaderData()
    const sel = useSkuSelection(detail)
    // 加购数量：与规格选中态一样由 route 持有，购买区步进器与 CTA 加购共用
    const [quantity, setQuantity] = useState(1)

    // 画廊图序：选中 SKU 有专属图时置顶（主图跟随规格切换），去重后供画廊以 URL 作键
    const images = (() => {
        const base =
            detail.images.length > 0
                ? detail.images
                : [detail.product.image].filter((i): i is string => i != undefined && i !== "")
        const merged = sel.matchedSku?.image
            ? [sel.matchedSku.image, ...base.filter((i) => i !== sel.matchedSku?.image)]
            : base
        return [...new Set(merged)]
    })()

    return (
        <div>
            <DetailHeader />
            {/* 版心比主版心宽：内容 1486 = 左栏 844 + 间距 48 + 右栏 594（对齐天猫详情页） */}
            <div className={`mx-auto w-full px-6 pb-10 ${DETAIL_CONTAINER_CLASS}`}>
                {/* 左滚右停：左栏（店铺条+画廊+描述）随滚动，右栏购买区钉住 */}
                <DetailColumns
                    rightWidth="594px"
                    gapClassName="gap-x-12"
                    left={
                        <>
                            {/* 左栏头部：店铺条（对齐天猫 shopHeader 844×54，下间距 16） */}
                            <section className="mb-4 h-13.5">
                                <ShopBar shopId={detail.product.shopId} />
                            </section>
                            {/* 图区：对齐天猫 picGallery 844×620 = 主图区 564 + 间距 16 + 底部切换条 40 */}
                            <Gallery
                                images={images}
                                params={detail.params}
                            />
                            {/* 吸顶锚点导航 + 评价/参数/图文详情 */}
                            <DetailSections detail={detail} />
                            <ShopRecommendSection detail={detail} />
                        </>
                    }
                    right={
                        // 右栏整块 = 一屏高（sticky top-4）：购买面板在上、动作卡贴右栏底部，中间留白固定不变；
                        // 滚动时整块一起走，到双栏区域末尾落进流位随页面滚走
                        // （不再出现“先压缩中间空白、空白没了才整体滚”的分段感）
                        <div className="sticky top-4 flex min-h-[calc(100vh-2rem)] flex-col">
                            <section className="rounded-xl bg-background px-6 py-2">
                                <PurchasePanel
                                    detail={detail}
                                    selection={sel.selection}
                                    select={sel.select}
                                    isAvailable={sel.isAvailable}
                                    quantity={quantity}
                                    onQuantityChange={setQuantity}
                                />
                            </section>
                            <div className="sticky bottom-4 mt-auto pt-3">
                                <PurchaseCta
                                    detail={detail}
                                    selection={sel.selection}
                                    quantity={quantity}
                                />
                            </div>
                        </div>
                    }
                />
                {/* 看了又看：整页宽区块，不局限在左栏（对齐淘宝详情页底部推荐流） */}
                <AlsoViewedSection detail={detail} />
            </div>
        </div>
    )
}
