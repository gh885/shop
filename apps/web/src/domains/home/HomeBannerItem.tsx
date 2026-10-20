import { Link } from "@tanstack/react-router"

import { Image } from "@shop/ui-web"

export interface HomeBannerCard {
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    decorClass?: string
}

export function HomeBannerItem({ banner }: { banner: HomeBannerCard }) {
    return (
        <Link
            to="/"
            className="group relative h-50 min-w-0 flex-1 overflow-hidden rounded-lg bg-background text-left"
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
