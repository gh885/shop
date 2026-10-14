import { moneyToYuan } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"
import { translateWeb } from "#/locales"
import type { ProductDetail } from "../product"

/**
 * 详情页的爬虫载荷：meta / canonical / JSON-LD。
 *
 * 这是 SSR 相对纯 SPA 的硬收益——社交与搜索爬虫首帧就要拿到标题、图和价格，
 * 所以这份形状由 `head` 直接写进 `<head>`，不进 React 树。规则放这里是因为
 * 「哪些字段必须出现、缺图时推不推 og:image」是可断言的契约，不该只在路由里肉眼核对。
 */

type HeadMeta =
    | { title: string }
    | { property: string; content: string }
    | { name: string; content: string }

const BRAND = "Shop"

export interface ProductSeo {
    meta: HeadMeta[]
    links: { rel: "canonical"; href: string }[]
    scripts: { type: "application/ld+json"; children: string }[]
}

export function productSeo(
    detail: ProductDetail | undefined,
    /** canonical：取不含查询串的路径本身，规格选择产生的 ?spec=... 全部收敛到这一个地址 */
    canonical: string,
    /** 请求级 Locale：只影响「无商品名时的兜底页名」，商品名本身是后端数据、不翻 */
    locale?: AppLocale,
): ProductSeo {
    const p = detail?.product
    const price = p?.priceMin
    const ogImage = p?.image || detail?.images[0]
    // "Shop"（品牌名/og:site_name/标题后缀）两语言同形、不入库；只有兜底页名走 catalog
    const fallbackTitle = translateWeb("route.title.productFallback", locale)

    const meta: HeadMeta[] = [
        { title: `${p?.title ?? fallbackTitle} - ${BRAND}` },
        // OpenGraph：SSR 直接写入 <head>，社交/搜索爬虫首帧即拿到（这是 SSR 相对 SPA 的硬收益）
        { property: "og:title", content: p?.title ?? fallbackTitle },
        { property: "og:type", content: "product" },
        { property: "og:site_name", content: BRAND },
        { property: "og:url", content: canonical },
        { name: "description", content: p?.subtitle || p?.title || fallbackTitle },
    ]
    if (ogImage) meta.push({ property: "og:image", content: ogImage })

    return {
        meta,
        links: [{ rel: "canonical", href: canonical }],
        scripts: [
            {
                type: "application/ld+json",
                // JSON-LD Product 结构：价格/库存/图给搜索引擎与购物聚合，SPA 无法提供
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
}
