function isUsable(url: string | null | undefined): url is string {
    return url != undefined && url !== ""
}

export function galleryImages(source: {
    images: readonly (string | null | undefined)[]
    productImage?: string | null
    skuImage?: string | null
}): string[] {
    const frames = source.images.filter(isUsable)
    if (frames.length === 0 && isUsable(source.productImage)) frames.push(source.productImage)

    const sku = source.skuImage
    const ordered = isUsable(sku) ? [sku, ...frames] : frames
    return [...new Set(ordered)]
}
