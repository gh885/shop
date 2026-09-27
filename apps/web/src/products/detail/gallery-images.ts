/**
 * 画廊图序规则（详情页左侧轮播吃什么）。
 *
 * 「SKU 专属图置顶 + 图集为空时退回商品主图 + 去重」原本是路由组件里的一串 IIFE，
 * 而画廊以 URL 作 React key——顺序算错不只是排错图，还会出现重复 key。
 */

function isUsable(url: string | null | undefined): url is string {
    return url != undefined && url !== ""
}

export function galleryImages(source: {
    /** 详情接口给的图集 */
    images: readonly (string | null | undefined)[]
    /** 商品主图：整个图集为空时才顶上 */
    productImage?: string | null
    /** 当前选中 SKU 的专属图 */
    skuImage?: string | null
}): string[] {
    const frames = source.images.filter(isUsable)
    // 图集一条都没有才退回主图：有图集却缺主图时，不该往里插一张规格不同的图
    if (frames.length === 0 && isUsable(source.productImage)) frames.push(source.productImage)

    const sku = source.skuImage
    // 专属图排到最前（主图跟随规格切换），原位置那条交给去重抹掉
    const ordered = isUsable(sku) ? [sku, ...frames] : frames
    return [...new Set(ordered)]
}
