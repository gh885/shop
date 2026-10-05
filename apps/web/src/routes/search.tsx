import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { PackageSearch } from "lucide-react"

import type { PageResultPublicProductResponse } from "@shop/api/sdk"

import { PaginationBar } from "@shop/app-kit/data"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { toApiError } from "@shop/common/contract"
import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    SearchBar,
    Skeleton,
    StateError,
    cn,
} from "@shop/ui-web"

import { ProductCard, toProduct, toProductCardData } from "#/products"
import {
    SEARCH_PAGE_SIZE,
    cleanSearch,
    hasSearchCriteria,
    parseSearchParams,
    searchProductsOptions,
    type SearchParams,
} from "#/search"

import { useT } from "#/locales/use-t"
import { useSearchNavigate } from "#/shared/lib/search"

export const Route = createFileRoute("/search")({
    validateSearch: parseSearchParams,
    component: SearchPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.search", match.context.locale) }],
    }),
})

function SearchPage() {
    const t = useT()
    const search = Route.useSearch()
    const navigate = useNavigate({ from: Route.fullPath })
    const runSearch = useSearchNavigate()
    const result = useQuery(searchProductsOptions(search))

    const criteria = hasSearchCriteria(search)
    const page = search.page ?? 1
    const totalPages = result.data
        ? Math.max(1, Math.ceil(result.data.total / SEARCH_PAGE_SIZE))
        : 0

    const update = (patch: Partial<SearchParams>, options?: { replace?: boolean }) => {
        void navigate({
            search: cleanSearch({ ...search, ...patch }),
            replace: options?.replace,
        })
    }

    const setPage = (next: number) => update({ page: next > 1 ? next : undefined })
    const clearKeyword = () => update({ q: undefined, page: undefined })
    const clearCategory = () => update({ categoryId: undefined, page: undefined })
    const clearAll = () => void navigate({ to: "/search", search: {} })

    return (
        <div className="mx-auto flex w-full max-w-page flex-col gap-5 px-6 py-6">
            <SearchBar
                key={search.q ?? ""}
                size="lg"
                placeholder={t("web.search.input.placeholder")}
                defaultValue={search.q ?? ""}
                onSearch={runSearch}
            />

            <SearchToolbar
                q={search.q}
                categoryId={search.categoryId}
                total={result.data?.total}
                fetching={result.isFetching && !result.isPending}
                onClearCategory={clearCategory}
            />

            <SearchResultBody
                criteria={criteria}
                result={result}
                q={search.q}
                categoryId={search.categoryId}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onRetry={() => void result.refetch()}
                onClearKeyword={clearKeyword}
                onClearCategory={clearCategory}
                onClearAll={clearAll}
            />
        </div>
    )
}

function SearchResultBody({
    criteria,
    result,
    q,
    categoryId,
    page,
    totalPages,
    onPageChange,
    onRetry,
    onClearKeyword,
    onClearCategory,
    onClearAll,
}: {
    criteria: boolean
    result: UseQueryResult<PageResultPublicProductResponse, unknown>
    q?: string
    categoryId?: string
    page: number
    totalPages: number
    onPageChange: (next: number) => void
    onRetry: () => void
    onClearKeyword: () => void
    onClearCategory: () => void
    onClearAll: () => void
}) {
    const t = useT()
    const { locale } = useI18n()
    if (!criteria) {
        return <SearchPrompt />
    }
    // 分支顺序不能调：searchProductsOptions 带 enabled: hasSearchCriteria(search)，没有搜索词时查询不启用、
    // isPending 会恒为 true。所以「无搜索词」的判断必须排在 isPending 之前，否则无词进来就是一块永久骨架。
    if (result.isPending) {
        return <SearchResultsSkeleton />
    }
    if (result.isError) {
        return (
            <SearchError
                error={result.error}
                onRetry={onRetry}
                retrying={result.isFetching}
            />
        )
    }
    if (result.data.records.length === 0) {
        return (
            <SearchEmpty
                q={q}
                categoryId={categoryId}
                onClearKeyword={onClearKeyword}
                onClearCategory={onClearCategory}
                onClearAll={onClearAll}
            />
        )
    }
    return (
        <section
            aria-busy={result.isPlaceholderData}
            className="flex flex-col gap-6"
        >
            {result.isPlaceholderData ? (
                <p className="text-sm text-muted-foreground">{t("web.search.updating")}</p>
            ) : undefined}
            <div
                className={cn(
                    "grid-feed transition-opacity duration-200",
                    result.isPlaceholderData && "opacity-60",
                )}
            >
                {result.data.records.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={toProductCardData(toProduct(product), locale)}
                    />
                ))}
            </div>
            <PaginationBar
                page={page}
                totalPages={totalPages}
                onPageChange={onPageChange}
            />
        </section>
    )
}

function SearchToolbar({
    q,
    categoryId,
    total,
    fetching,
    onClearCategory,
}: {
    q?: string
    categoryId?: string
    total?: number
    fetching: boolean
    onClearCategory: () => void
}) {
    const t = useT()
    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {q ? (
                    <span>{t("web.search.summary.query", { query: q })}</span>
                ) : categoryId ? (
                    <span>{t("web.search.summary.inCategory")}</span>
                ) : (
                    <span>{t("web.search.summary.all")}</span>
                )}
                {categoryId ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onClearCategory}
                    >
                        {t("web.search.filter.clearCategory")}
                    </Button>
                ) : undefined}
                {total === undefined ? undefined : (
                    <span>{t("web.search.filter.total", { total })}</span>
                )}
                {fetching ? <span>{t("web.search.filter.refreshing")}</span> : undefined}
            </div>
        </div>
    )
}
function SearchPrompt() {
    const t = useT()
    return (
        <Empty className="py-20">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>{t("web.search.empty.prompt.title")}</EmptyTitle>
                <EmptyDescription>{t("web.search.empty.prompt.body")}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}

function SearchResultsSkeleton() {
    return (
        <div className="grid-feed">
            {Array.from({ length: SEARCH_PAGE_SIZE }, (_, index) => (
                <Skeleton
                    key={index}
                    className="aspect-5/7 w-full rounded-lg"
                />
            ))}
        </div>
    )
}

function SearchError({
    error,
    onRetry,
    retrying,
}: {
    error: unknown
    onRetry: () => void
    retrying: boolean
}) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <StateError
            message={errorText(toApiError(error), locale, t("common.loadFailed.feed"))}
            onRetry={onRetry}
            retrying={retrying}
        />
    )
}

function SearchEmpty({
    q,
    categoryId,
    onClearKeyword,
    onClearCategory,
    onClearAll,
}: {
    q?: string
    categoryId?: string
    onClearKeyword: () => void
    onClearCategory: () => void
    onClearAll: () => void
}) {
    const t = useT()
    return (
        <Empty className="py-20">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>
                    {q
                        ? t("web.search.empty.noResult.title", { query: q })
                        : t("web.search.empty.noResult.titleNoQuery")}
                </EmptyTitle>
                <EmptyDescription>{t("web.search.empty.noResult.body")}</EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-wrap items-center justify-center gap-2">
                {q ? (
                    <Button onClick={onClearKeyword}>{t("web.search.empty.clearKeyword")}</Button>
                ) : undefined}
                {categoryId ? (
                    <Button
                        variant="outline"
                        onClick={onClearCategory}
                    >
                        {t("web.search.empty.removeCategory")}
                    </Button>
                ) : undefined}
                <Button
                    variant="ghost"
                    onClick={onClearAll}
                >
                    {t("web.search.empty.clearAll")}
                </Button>
            </div>
        </Empty>
    )
}
