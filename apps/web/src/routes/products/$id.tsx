import { moneyToYuan, toApiError } from "@shop/common"
import { useState } from "react"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"

import { cn } from "@shop/ui-web"

import type { ProductDetail } from "#/products"
import {
    AlsoViewedSection,
    DETAIL_LAYOUT,
    DetailHeader,
    DetailSections,
    Gallery,
    PDP_MAX_QUANTITY,
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
import { DetailColumns } from "#/shared/ui/DetailColumns"
import { SITE_ORIGIN } from "#/shared/lib/env"

export const Route = createFileRoute("/products/$id")({
    /**
     * 规格选择进 URL：`?spec={"颜色":"红","尺码":"L"}`。
     * 与结算页 `CheckoutSource` 同一套机制（validateSearch + zod + catch 兜脏值），
     * 脏 URL 退化成「未选规格」而不是报错。
     *
     * 入参声明为 `SkuSearchInput`（带 SearchSchemaInput 标记）只是为了让其它页面能裸链到详情页。
     */
    validateSearch: (search: SkuSearchInput): SkuSearch => skuSearchSchema.parse(search),
    /**
     * SSR 预取：详情先行（404 直接 notFound），店铺信息依赖 detail.shopId 只能串行；
     * 店铺失败不拖垮页面（店条转内联错误 + 重试），详情失败才致命。
     */
    loader: async ({ context, params }) => {
        let detail: ProductDetail
        try {
            // 有缓存即返回、没有才取数（query + staleTime: "static" 是官方给 ensureQueryData 的替代口径）
            detail = await context.queryClient.query({
                ...productDetailOptions(params.id),
                staleTime: "static",
            })
        } catch (error) {
            // 详情不存在/非上架由后端 404；数据层已把错误归一化为 ApiError（status/detail）
            if (toApiError(error).status === 404) throw notFound()
            // 其余失败（含「2xx 但不符合契约」的 zod 校验失败）照常抛：
            // 详情页伪造不出合法的 ProductDetail，伪装成 notFound 只会把后端契约漂移藏成一个假的「商品不存在」。
            // 交给路由 errorComponent 渲染错误页 + 官方重试链路。
            throw error
        }
        await context.queryClient
            .query({ ...shopOptions(detail.product.shopId), staleTime: "static" })
            .catch(() => {})
        return { detail }
    },
    component: ProductDetailPage,
    /**
     * 客户端导航到详情页、loader 超时未完成时顶上。
     * 与区块级的三态配套：区块有自己的骨架，整页也有（否则期间停在旧页面上，点了没反应）。
     */
    pendingComponent: ProductDetailSkeleton,
    head: ({ match }) => {
        const d = match.loaderData?.detail
        const p = d?.product
        const price = p?.priceMin
        const ogImage = p?.image || d?.images[0]
        // canonical 取 match.pathname（不含查询串）：规格选择进了 URL，?spec=... 会产生大量等价副本，
        // 全部收敛到一个权威地址；也不依赖 loaderData，加载失败/降级时不会拼出 /products/undefined
        const canonical = `${SITE_ORIGIN}${match.pathname}`
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
            { property: "og:url", content: canonical },
            { name: "description", content: p?.subtitle || p?.title || "商品详情" },
        ]
        if (ogImage) meta.push({ property: "og:image", content: ogImage })
        return {
            meta,
            links: [{ rel: "canonical", href: canonical }],
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
                                      // schema.org 规定价格与币种是两个字段：这里从 Money 拆开，链路内部不拆
                                      "@type": "Offer",
                                      price: moneyToYuan(price),
                                      priceCurrency: price.currency,
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
    const search = Route.useSearch()
    const navigate = useNavigate({ from: Route.fullPath })

    /**
     * 规格选择的读写接线：读 URL、写 URL。push / replace 的分工在这里落地 ——
     * `select`（用户动作）push 进历史，后退能撤回一次选择；
     * 自愈修正 replace 掉脏值，不进历史。
     */
    const sel = useSkuSelection({
        detail,
        spec: search.spec,
        onSpecChange: (spec, options) => {
            void navigate({
                // 空选择不带参数：详情页是最常被分享的 URL，`?spec=%7B%7D` 是纯噪音
                search: Object.keys(spec).length > 0 ? { spec } : {},
                replace: options.replace,
                // 换规格不该把页面弹回顶部：用户还在看同一屏
                resetScroll: false,
            })
        },
    })

    // 数量由 route 持有：购买区步进器与 CTA 加购共用同一份收敛后的值
    const [quantity, setQuantity] = useState(1)
    /**
     * 规格切到库存更少的 SKU 后，原数量可能超卖。展示与提交共用这一份收敛值 ——
     * 只收敛展示会让步进器显示 1 而提交 5，收敛只放在提交里则用户看到的数字是假的。
     * 下界保 1：售罄时显示 1 而不是 0（加购按钮由 PurchaseCta 的 complete/售罄判定禁用）。
     */
    const stockLimit = sel.matchedSku?.stock ?? PDP_MAX_QUANTITY
    const effectiveQuantity = Math.min(quantity, Math.max(1, stockLimit))

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
            <div className={cn("mx-auto w-full px-6 pb-10", DETAIL_LAYOUT.container)}>
                {/* 左滚右停：左栏（店铺条+画廊+描述）随滚动，右栏购买区钉住。
                    版心与双栏宽度同源（DETAIL_LAYOUT），改一处不会只改对一半 */}
                <DetailColumns
                    rightWidth={DETAIL_LAYOUT.rightWidth}
                    gapClassName={DETAIL_LAYOUT.gap}
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
                        <div
                            className={cn(
                                DETAIL_LAYOUT.stickyTop,
                                "sticky flex",
                                DETAIL_LAYOUT.minHeight,
                                "flex-col",
                            )}
                        >
                            <section className="rounded-xl bg-background px-6 py-2">
                                <PurchasePanel
                                    detail={detail}
                                    selection={sel.selection}
                                    select={sel.select}
                                    isAvailable={sel.isAvailable}
                                    quantity={effectiveQuantity}
                                    onQuantityChange={setQuantity}
                                />
                            </section>
                            <div className="sticky bottom-4 mt-auto pt-3">
                                <PurchaseCta
                                    detail={detail}
                                    selection={sel.selection}
                                    quantity={effectiveQuantity}
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
