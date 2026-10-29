import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { cn, Logo } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

// 搜索页在重写期整体删除（后端 search 模块未开工）：这里只保留 logo + 标题 + 右侧扩展位，
// 不再挂跳 /search 的搜索框；等搜索模块落回来时再把 SearchBar 接回来。
export function SearchHeader({
    title,
    className,
    containerClassName,
    extra,
}: {
    title?: string
    className?: string
    containerClassName?: string
    extra?: ReactNode
}) {
    const t = useT("common")

    return (
        <header className={cn("border-b border-border/60 bg-background", className)}>
            <div
                className={cn(
                    "mx-auto flex w-full flex-col gap-3 px-6 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:py-0",
                    containerClassName ?? "max-w-page",
                )}
            >
                <div className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label={t("common.a11y.home")}
                    >
                        <Logo size={36} />
                    </Link>
                    {title && (
                        <h1 className="shrink-0 whitespace-nowrap text-xl font-semibold text-foreground">
                            {title}
                        </h1>
                    )}
                </div>

                {extra && <div className="flex shrink-0 items-center">{extra}</div>}
            </div>
        </header>
    )
}
