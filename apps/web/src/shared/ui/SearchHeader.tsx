import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { cn, Logo, SearchBar } from "@shop/ui-web"

import { useSearchNavigate } from "#/shared/lib/search"
import { useT } from "#/locales/use-t"

export function SearchHeader({
    title,
    defaultQuery,
    className,
    containerClassName,
    extra,
}: {
    title?: string
    defaultQuery?: string
    className?: string
    containerClassName?: string
    extra?: ReactNode
}) {
    const runSearch = useSearchNavigate()
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

                <SearchBar
                    size="sm"
                    defaultValue={defaultQuery}
                    onSearch={runSearch}
                    trailing={extra}
                    className="w-full md:w-100"
                />
            </div>
        </header>
    )
}
