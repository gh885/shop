import { useQuery } from "@tanstack/react-query"

import { Empty, EmptyHeader, EmptyTitle, Skeleton } from "@shop/ui-web"

import type { Product, ProductDetail } from "#/entities/product"
import { ProductCard } from "#/entities/product"
import {
    alsoViewedOptions,
    shopProductsOptions,
} from "#/features/product-detail/use-product-detail"

import { DetailSection } from "./detail-section"

/** 推荐流通用网格：商品卡片 + 骨架屏，本店推荐与看了又看共用 */
function RecoGrid({ products, currentId }: { products: Product[] | undefined; currentId: string }) {
    // 排除当前商品本身
    const list = products?.filter((p) => p.id !== currentId)

    return (
        <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
            {list
                ? list.map((product) => (
                      <ProductCard
                          key={product.id}
                          product={{
                              id: product.id,
                              image: product.image,
                              title: product.title,
                              price: product.priceMin?.amount ?? 0,
                          }}
                      />
                  ))
                : Array.from({ length: 5 }, (_, i) => (
                      <Skeleton
                          key={i}
                          className="aspect-square w-full rounded-lg"
                      />
                  ))}
            {list && list.length === 0 && (
                <Empty className="col-span-full py-6">
                    <EmptyHeader>
                        <EmptyTitle>暂无推荐商品</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            )}
        </div>
    )
}

/** 本店推荐：同店铺在售商品（排除当前商品） */
export function ShopRecommendSection({ detail }: { detail: ProductDetail }) {
    const { data } = useQuery(shopProductsOptions(detail.product.shopId))

    return (
        <DetailSection
            id="shop-reco"
            title="本店推荐"
        >
            <RecoGrid
                products={data?.records}
                currentId={detail.product.id}
            />
        </DetailSection>
    )
}

/** 看了又看：全站上新流占位（后端推荐接口就绪后替换数据源），排除当前商品 */
export function AlsoViewedSection({ detail }: { detail: ProductDetail }) {
    const { data } = useQuery(alsoViewedOptions)

    return (
        <DetailSection
            id="also-viewed"
            title="看了又看"
        >
            <RecoGrid
                products={data?.records}
                currentId={detail.product.id}
            />
        </DetailSection>
    )
}
