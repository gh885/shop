import { useSuspenseQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"
import { QueryBoundary } from "@shop/app-kit/data"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { toApiError } from "@shop/common/contract"
import { useT } from "#/locales/use-t"

import { HomeBannerItem } from "./HomeBannerItem"
import { bannersOptions } from "./queries"

/**
 * 首页首屏 banner 条（取前 3 个投放位）。
 *
 * <p>三态与 HomeCategoryNav / ShopBar 同形：挂起 → 同形骨架网格；失败 → 块级错误 + 重试
 * （QueryBoundary 官方 reset 链路），不再静默留白——中栏空一块和伪装空态同样糟。
 * 空数组是真正的「今天没配 banner」→ 回退前端内置的静态默认 banner：首屏运营位不留白、
 * 不塌版式（骨架撤掉后网格还在）；但失败**不**走这条回退，错误必须显形。
 */
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

/** 失败态：组件而非渲染函数，locale 与本端 catalog 要靠 hook 取（ShopBar / Feed 同款理由） */
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

/** 三态共用同一个网格壳：列宽/断点一致，切换时不跳版式 */
const gridClass = "grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

/** 运营空配置时的静态默认 banner（[BAN-04]）：无图渐变卡，文案是长期在线的通用主题。
 *  title/subtitle 存 key，渲染时在组件里过 `t()`——这里是本端硬编码兜底文案，不是后端投放数据。 */
const DEFAULT_BANNERS = [
    {
        key: "default-hot",
        titleKey: "home.banners.hot.title",
        subtitleKey: "home.banners.hot.subtitle",
        decorClass: "from-orange-300 to-rose-400",
    },
    {
        key: "default-new",
        titleKey: "home.banners.new.title",
        subtitleKey: "home.banners.new.subtitle",
        decorClass: "from-sky-300 to-indigo-400",
    },
    {
        key: "default-deal",
        titleKey: "home.banners.deal.title",
        subtitleKey: "home.banners.deal.subtitle",
        decorClass: "from-emerald-300 to-teal-400",
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
                    className="h-50 rounded-xl"
                />
            ))}
        </div>
    )
}

function HomeBannersError({
    message,
    onRetry,
}: {
    /** 已按 §7.3 那条链定稿的句子（`errorText`：登记码 → catalog，中文界面 → 后端 detail，否则站点那句） */
    message: string
    onRetry: () => void
}) {
    const t = useT("home")
    return (
        <div
            role="alert"
            className="flex h-50 min-w-0 flex-1 items-center justify-center gap-3 rounded-xl bg-background px-4 shadow-sm"
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
