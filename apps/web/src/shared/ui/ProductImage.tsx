/** 商品主图占位：有图渲染懒加载 img（父级带 group 时 hover 微放大），无图渲染灰底「暂无图片」，避免 img src="" 警告 */
export function ProductImage({ src, alt }: { src: string | null | undefined; alt: string }) {
    return src ? (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            className="aspect-square w-full object-cover transition-transform duration-150 group-hover:scale-[1.04]"
        />
    ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            暂无图片
        </div>
    )
}
