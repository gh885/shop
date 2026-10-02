import { describe, expect, it } from "vite-plus/test"

import type { ProductDetail } from "../product"

import { productSeo } from "./seo"

/**
 * 详情实体只填 SEO 载荷真正读的那几个字段，其余给形状所需的默认值。
 * 覆盖用展开而不是 `??`：`image: null` / `subtitle: null` 是要真的传成 null，
 * 用 `??` 会被当成「没覆盖」，测出来的其实是默认值。
 */
const PRODUCT: ProductDetail["product"] = {
    id: "p-1",
    shopId: "s-1",
    categoryId: "c-1",
    title: "无线耳机",
    subtitle: "降噪 · 30 小时续航",
    image: "https://cdn/shop/p-1.jpg",
    priceMin: { amount: 19900, currency: "CNY" },
    priceMax: { amount: 19900, currency: "CNY" },
    soldCount: 0,
}

const MAIN_IMAGE = "https://cdn/shop/p-1-1.jpg"

function makeDetail(
    over: { product?: Partial<ProductDetail["product"]>; images?: string[] } = {},
): ProductDetail {
    return {
        product: { ...PRODUCT, ...over.product },
        sevenDayReturn: true,
        detailImages: [],
        images: over.images ?? [MAIN_IMAGE],
        specs: [],
        params: [],
        skus: [],
    }
}

const CANONICAL = "https://shop.example/products/p-1"

/**
 * 爬虫载荷是对外契约：字段缺一个，社交卡片和搜索结果就少一块。
 * 所以断言打在「必有 / 缺时不推」两类上，而不是逐条抄一遍 meta 表。
 */
describe("productSeo", () => {
    it("canonical 与 og:url 同值_规格选择产生的 ?spec=... 全部收敛到这一个地址", () => {
        const seo = productSeo(makeDetail({}), CANONICAL)
        expect(seo.links).toEqual([{ rel: "canonical", href: CANONICAL }])
        expect(seo.meta).toContainEqual({ property: "og:url", content: CANONICAL })
    })

    it("没有主图才按图集首张兜底_两者都没有就不推 og:image，不推一个坏 URL", () => {
        expect(productSeo(makeDetail({ product: { image: null } }), CANONICAL).meta).toContainEqual(
            {
                property: "og:image",
                content: MAIN_IMAGE,
            },
        )
        const noImage = productSeo(
            makeDetail({ product: { image: null }, images: [] }),
            CANONICAL,
        ).meta
        expect(noImage.some((m) => "property" in m && m.property === "og:image")).toBe(false)
    })

    it("JSON-LD 把 Money 拆成 price 与 priceCurrency_schema.org 规定是两个字段，链路内部不拆", () => {
        const ld = JSON.parse(productSeo(makeDetail({}), CANONICAL).scripts[0]?.children ?? "{}")
        expect(ld.offers).toEqual({
            "@type": "Offer",
            price: "199.00",
            priceCurrency: "CNY",
            availability: "https://schema.org/InStock",
        })
    })

    it("详情还没到位（加载失败/降级）_标题走兜底，不拼出 undefined，也不伪造一个假的 notFound 载荷", () => {
        const seo = productSeo(undefined, CANONICAL)
        expect(seo.meta).toContainEqual({ title: "商品详情 - Shop" })
        expect(seo.meta).toContainEqual({ property: "og:title", content: "商品详情" })
        const ld = JSON.parse(seo.scripts[0]?.children ?? "{}")
        expect(ld.offers).toBeUndefined()
        expect(ld.name).toBeUndefined()
    })

    it("兜底页名按请求级 Locale 走 catalog（§9 P3′-a）；商品名本身是数据、不翻", () => {
        const seo = productSeo(undefined, CANONICAL, "en-US")
        expect(seo.meta).toContainEqual({ title: "Product Detail - Shop" })
        expect(seo.meta).toContainEqual({ property: "og:title", content: "Product Detail" })
    })

    it("没有副标题_description 退回主标题，不留空（空 description 等于没有摘要）", () => {
        expect(
            productSeo(makeDetail({ product: { subtitle: null } }), CANONICAL).meta,
        ).toContainEqual({ name: "description", content: "无线耳机" })
    })
})
