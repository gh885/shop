import type { WebMessageKey } from "#/locales/messages.gen"

/**
 * Tailwind 按**源码里的字面量**扫描候选类名，`max-w-[calc(var(--x)_+_${Y})]` 这种插值
 * 扫不到，生成的 CSS 里就没有这条工具类。所以这里全部写字面量，
 * 需要联动的地方用注释点明对应关系。
 */
export const DETAIL_LAYOUT = {
    container: "max-w-[calc(var(--container-page)_+_3rem)]",

    rightWidth: "594px",

    gap: "gap-x-12",

    stickyTop: "lg:top-4",

    minHeight: "lg:min-h-[calc(100vh-2rem)]",
} as const

/**
 * 这个 99 **不是**服务端的闸门（那是 1..999，见 PRD-72 / ORD-03），两个数刻意不对齐成一个：
 * 这一格防的是「一屏灌进离谱数字」，那一格防的是恶拍。谁把它们对齐了 PRD-72 就没了，
 * 所以 `FieldRuleVocabularyTest.详情页的展示上界必须严于服务端闸门` 把这条不等式钉成了测试。
 */
export const PDP_MAX_QUANTITY = 99

type DetailSectionKey = Extract<WebMessageKey, `product.detail.section.${string}`>

export const DETAIL_SECTIONS = [
    { id: "reviews", labelKey: "product.detail.section.reviews" },
    { id: "params", labelKey: "product.detail.section.params" },
    { id: "detail", labelKey: "product.detail.section.detail" },
    { id: "shop-reco", labelKey: "product.detail.section.shopReco" },
    { id: "also-viewed", labelKey: "product.detail.section.alsoViewed" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: DetailSectionKey }>
