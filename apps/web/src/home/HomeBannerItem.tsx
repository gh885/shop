import { Link } from "@tanstack/react-router"

import { Image } from "@shop/ui-web"

/** 卡片数据形状：BannerResponse 是其超集；静态默认 banner 只有文案 + 渐变装饰 */
export interface HomeBannerCard {
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    /** 无图时的渐变装饰档（bg-linear-to-br 的 from/to 色标，同一品牌色相的不同深度，见 HomeBanners） */
    decorClass?: string
}

/** 单个 banner 位：图 + 底部渐变标题，hover 微缩放。
 *  占位底色用 background（与卡壳同色，不再另起一层 sunken/50 的灰），
 *  图没到时露出的是白卡而不是第二种灰 */
export function HomeBannerItem({ banner }: { banner: HomeBannerCard }) {
    return (
        // TODO: banner 规划了跳转链路（活动页/商品聚合页），暂无对应路由，先落回首页
        <Link
            to="/"
            className="group relative h-50 min-w-0 flex-1 overflow-hidden rounded-xl bg-background text-left"
        >
            {banner.imageUrl ? (
                <Image
                    src={banner.imageUrl}
                    alt={banner.title}
                    priority
                    hoverScale
                    className="h-full w-full"
                />
            ) : (
                <div
                    aria-hidden
                    className={`h-full w-full bg-linear-to-br transition-transform duration-150 group-hover:scale-104 ${banner.decorClass ?? "from-primary/30 to-primary/70"}`}
                />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="text-base font-bold text-white">{banner.title}</div>
                {banner.subtitle && (
                    <div className="mt-0.5 text-xs text-white/80">{banner.subtitle}</div>
                )}
            </div>
        </Link>
    )
}
