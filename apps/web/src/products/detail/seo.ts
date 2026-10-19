import { moneyToYuan } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"
import { translateWeb } from "#/locales"
import type { ProductDetail } from "../rules"

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
    canonical: string,
    locale?: AppLocale,
): ProductSeo {
    const p = detail?.product
    const price = p?.priceMin
    const ogImage = p?.image || detail?.images[0]
    const fallbackTitle = translateWeb("route.title.productFallback", locale)

    const meta: HeadMeta[] = [
        { title: `${p?.title ?? fallbackTitle} - ${BRAND}` },
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
