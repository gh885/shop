import { useSuspenseQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"
import { QueryBoundary } from "@shop/app-kit/data"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { toApiError } from "@shop/common/contract"
import { useT } from "#/locales/use-t"

import { HomeBannerItem } from "./HomeBannerItem"
import { bannersOptions } from "./queries"

export function HomeBanners() {
    return (
        <QueryBoundary
            pending={<HomeBannersSkeleton />}
            fallback={(args) => <HomeBannersErrorFallback {...args} />}
        >
            <HomeBannersContent />
        </QueryBoundary>
    )
}

function HomeBannersErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <HomeBannersError
            message={errorText(toApiError(error), locale, t("common.loadFailed.banners"))}
            onRetry={reset}
        />
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

function HomeBannersContent() {
    const { data: banners } = useSuspenseQuery(bannersOptions)
    const t = useT("home")

    return (
        <div className={gridClass}>
            {banners.length === 0
                ? DEFAULT_BANNERS.map((banner) => (
                      <HomeBannerItem
                          key={banner.key}
                          banner={{
                              title: t(banner.titleKey),
                              subtitle: t(banner.subtitleKey),
                              decorClass: banner.decorClass,
                          }}
                      />
                  ))
                : banners.slice(0, 3).map((banner) => (
                      <HomeBannerItem
                          key={banner.id}
                          banner={banner}
                      />
                  ))}
        </div>
    )
}

export function HomeBannersSkeleton() {
    return (
        <div
            className={gridClass}
            aria-hidden
        >
            {Array.from({ length: 3 }, (_, i) => (
                <Skeleton
                    key={i}
                    className="h-50 rounded-lg"
                />
            ))}
        </div>
    )
}

function HomeBannersError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const t = useT("home")
    return (
        <div
            role="alert"
            className="flex h-50 min-w-0 flex-1 items-center justify-center gap-3 px-4"
        >
            <CircleAlert className="size-5 shrink-0 text-destructive" />
            <p className="truncate text-sm text-muted-foreground">{message}</p>
            <Button
                variant="outline"
                size="sm"
                shape="pill"
                onClick={onRetry}
            >
                {t("home.retry")}
            </Button>
        </div>
    )
}
