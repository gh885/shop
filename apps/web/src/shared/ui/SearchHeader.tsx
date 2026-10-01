import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { cn, Logo, SearchBar } from "@shop/ui-web"

import { useSearchNavigate } from "#/shared/lib/search"

/**
 * 通用页面顶栏（非吸顶，随页面滚走）：左品牌 logo + 可选页面标题，右搜索组。
 * 所有内页页头共用这一块——差异只有「标题文案」和「版心宽度」两件事，
 * 其余（logo 尺寸、标题字号、分隔线、搜索框档位）一旦各页记一套数就必然漂移。
 */
export function SearchHeader({
    title,
    defaultQuery,
    className,
    containerClassName,
    extra,
}: {
    title?: string
    /** 内页搜索框初始值（详情页没有，搜索页可用自身 SearchBar） */
    defaultQuery?: string
    className?: string
    /** 覆盖版心容器（默认 max-w-page）。详情页/窄版心页面的顶栏要跟正文同宽才能左右对齐 */
    containerClassName?: string
    extra?: ReactNode
}) {
    const runSearch = useSearchNavigate()

    return (
        <header className={cn("border-b border-border/60 bg-background", className)}>
            <div
                className={cn(
                    "mx-auto flex h-16 w-full items-center justify-between px-6",
                    containerClassName ?? "max-w-page",
                )}
            >
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

                <SearchBar
                    size="sm"
                    placeholder="搜索"
                    defaultValue={defaultQuery}
                    onSearch={runSearch}
                    trailing={extra}
                    className="w-100"
                />
            </div>
        </header>
    )
}
