import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { cn, Logo, SearchBar } from "@shop/ui-web"

import { notifySearchComingSoon } from "#/shared/lib/search"

/**
 * 通用页面顶栏（非吸顶，随页面滚走）：左品牌 logo + 可选页面标题，右搜索组。
 * 所有内页页头共用这一块——差异只有「标题文案」和「版心宽度」两件事，
 * 其余（logo 尺寸、标题字号、分隔线、搜索框档位）一旦各页记一套数就必然漂移。
 *
 * 搜索后端未建，先 toast 占位；extra 挂各页自己的附加入口（如详情页「搜本店」）。
 */
export function SearchHeader({
    title,
    className,
    containerClassName,
    extra,
}: {
    title?: string
    className?: string
    /** 覆盖版心容器（默认 max-w-page）。详情页/窄版心页面的顶栏要跟正文同宽才能左右对齐 */
    containerClassName?: string
    extra?: ReactNode
}) {
    return (
        <header className={cn("border-b border-border/60 bg-background", className)}>
            <div
                className={cn(
                    "mx-auto flex h-16 w-full items-center justify-between px-6",
                    containerClassName ?? "max-w-page",
                )}
            >
                {/* 左：品牌 logo（与首页同款）+ 可选页面标题 */}
                <div className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label="有店首页"
                    >
                        <Logo size={36} />
                    </Link>
                    {title && <h1 className="text-xl font-semibold text-foreground">{title}</h1>}
                </div>

                {/* 右侧搜索组：与首页同一个组件，只是尺寸档不同 */}
                <SearchBar
                    size="sm"
                    placeholder="搜索"
                    onSearch={notifySearchComingSoon}
                    trailing={extra}
                    className="w-100"
                />
            </div>
        </header>
    )
}
