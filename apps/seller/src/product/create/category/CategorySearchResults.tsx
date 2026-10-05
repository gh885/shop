import { CornerDownLeft, SearchX } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, cn } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import type { LeafPath } from "#/product/category"

/**
 * 搜索发品的候选类目列表：命中的是「末级类目路径」，
 * 选中后回填级联（卖家仍能看清自己落在哪条路径上），而不是直接跳下一步。
 * 与级联列同款白色列面，靠底色而非边框与外层浅灰分块。
 */
export function CategorySearchResults({
    keyword,
    results,
    selectedLeafId,
    onPick,
}: {
    keyword: string
    results: LeafPath[]
    selectedLeafId?: string
    onPick: (path: LeafPath) => void
}) {
    const t = useT("product")
    if (results.length === 0) {
        return (
            <div className="flex h-115 items-center rounded-xl bg-background">
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <SearchX />
                        </EmptyMedia>
                        <EmptyTitle>
                            {t("seller.product.category.result.emptyTitle", { keyword })}
                        </EmptyTitle>
                        <EmptyDescription>
                            {t("seller.product.category.result.emptyBody")}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        )
    }

    return (
        <div className="h-115 overflow-y-auto rounded-xl bg-background">
            <p className="sticky top-0 bg-background px-4 py-2.5 text-xs text-muted-foreground">
                {t("seller.product.category.result.count", { count: results.length })}
            </p>
            <ul className="px-1.5 pb-2">
                {results.map((path) => (
                    <li key={path.id}>
                        <button
                            type="button"
                            onClick={() => onPick(path)}
                            aria-pressed={path.id === selectedLeafId}
                            className={cn(
                                "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-hidden transition-colors",
                                "hover:bg-muted focus-visible:bg-muted",
                                path.id === selectedLeafId && "bg-accent hover:bg-accent",
                            )}
                        >
                            <span className="min-w-0 flex-1 truncate">
                                {path.names.slice(0, -1).map((name) => (
                                    <span
                                        key={name}
                                        className="text-muted-foreground"
                                    >
                                        {name}
                                        <span className="mx-1 text-muted-foreground/60">/</span>
                                    </span>
                                ))}
                                <span className="font-medium text-foreground">
                                    {path.names.at(-1)}
                                </span>
                            </span>
                            <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
