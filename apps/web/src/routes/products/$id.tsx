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

    /**
     * 规格选择的读写接线：读 URL、写 URL。push / replace 的分工在这里落地 ——
     * `select`（用户动作）push 进历史，后退能撤回一次选择；
     * 自愈修正 replace 掉脏值，不进历史。
     */
    const sel = useSkuSelection({
        detail,
        // 「未选规格」在 URL 里表示成「没有 spec」，读的时候补一个空选择（sku-search.ts 有为什么）
        spec: search.spec ?? {},
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
    // 收敛规则（上界跟库存、下界保 1，展示与提交同源）在 detail/purchase-quantity.ts
    const effectiveQuantity = clampPurchaseQuantity(quantity, sel.matchedSku?.stock)

    // 图序规则（SKU 专属图置顶 / 空图集退主图 / 去重）在 detail/gallery-images.ts
    const images = galleryImages({
        images: detail.images,
        productImage: detail.product.image,
        skuImage: sel.matchedSku?.image,
    })

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
                            {/* 吸顶锚点导航 + 评价/参数/图文详情 */}
                            <DetailSections detail={detail} />
                            <ShopRecommendSection detail={detail} />
                        </>
                    }
                    right={
                        // 右栏整块 = 一屏高（sticky top-4）：购买面板在上、动作卡贴右栏底部，中间留白固定不变；
                        // 滚动时整块一起走，到双栏区域末尾落进流位随页面滚走
                        // （不再出现“先压缩中间空白、空白没了才整体滚”的分段感）
                        // 这一整套只在 lg 起成立：窄屏 DetailColumns 回落单栏，钉住 + 撑满一屏只会留一片空白
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
                {/* 看了又看：整页宽区块，不局限在左栏（对齐淘宝详情页底部推荐流） */}
                <AlsoViewedSection detail={detail} />
            </div>
        </div>
    )
}
