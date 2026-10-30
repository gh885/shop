import { useT } from "#/locales/use-t"

import { HomeBannerItem } from "./HomeBannerItem"

export function HomeBanners() {
    const t = useT("home")
    return (
        <div className={gridClass}>
            {DEFAULT_BANNERS.map((banner) => (
                <HomeBannerItem
                    key={banner.key}
                    banner={{
                        title: t(banner.titleKey),
                        subtitle: t(banner.subtitleKey),
                        decorClass: banner.decorClass,
                    }}
                />
            ))}
        </div>
    )
}

const gridClass = "grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

const DEFAULT_BANNERS = [
    {
        key: "default-hot",
        titleKey: "home.banners.hot.title",
        subtitleKey: "home.banners.hot.subtitle",
        decorClass: "from-primary/35 to-primary/65",
    },
    {
        key: "default-new",
        titleKey: "home.banners.new.title",
        subtitleKey: "home.banners.new.subtitle",
        decorClass: "from-primary/30 to-primary/55",
    },
    {
        key: "default-deal",
        titleKey: "home.banners.deal.title",
        subtitleKey: "home.banners.deal.subtitle",
        decorClass: "from-primary/25 to-primary/45",
    },
] as const
