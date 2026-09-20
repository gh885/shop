import { useSuspenseQuery } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"
import { QueryBoundary } from "@shop/app-kit"
import { toApiError } from "@shop/common"

import { HomeBannerItem } from "./HomeBannerItem"
import { bannersOptions } from "./queries"

/**
 * 首页首屏 banner 条（取前 3 个投放位）。
 *
 * <p>三态与 HomeCategoryNav / ShopBar 同形：挂起 → 同形骨架网格；失败 → 块级错误 + 重试
 * （QueryBoundary 官方 reset 链路），不再静默留白——中栏空一块和伪装空态同样糟。
 * 空数组是真正的「今天没配 banner」→ 整块不画，运营位缺失不是异常。
 */
export function HomeBanners() {
    return (
        <QueryBoundary
            pending={<HomeBannersSkeleton />}
            fallback={homeBannersErrorFallback}
        >
            <HomeBannersContent />
        </QueryBoundary>
    )
}

/** 失败态渲染函数放模块作用域：内联箭头会让每次渲染都新建一个组件（ShopBar 同款理由） */
function homeBannersErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    return (
        <HomeBannersError
            message={toApiError(error).detail || "活动位加载失败"}
            onRetry={reset}
        />
    )
}

/** 三态共用同一个网格壳：列宽/断点一致，切换时不跳版式 */
const gridClass = "grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

function HomeBannersContent() {
    const { data: banners } = useSuspenseQuery(bannersOptions)

    if (banners.length === 0) return null

    return (
        <div className={gridClass}>
            {banners.slice(0, 3).map((banner) => (
                <HomeBannerItem
                    key={banner.id}
                    banner={banner}
                />
            ))}
        </div>
    )
}

function HomeBannersSkeleton() {
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
    /** 已归一化的错误描述（调用方用 `toApiError(error).detail` 传入） */
    message: string
    onRetry: () => void
}) {
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
                重试
            </Button>
        </div>
    )
}
