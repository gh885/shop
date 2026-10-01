import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
    head: () => ({
        meta: [{ title: "搜索 - Shop" }],
    }),
})

// fallow-ignore-next-line complexity
function SearchPage() {
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
                placeholder="搜索商品"
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

// fallow-ignore-next-line complexity
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
                <p className="text-sm text-muted-foreground">正在更新结果…</p>
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
                        product={toProductCardData(toProduct(product))}
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

// fallow-ignore-next-line complexity
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
    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {q ? (
                    <span>搜索「{q}」</span>
                ) : categoryId ? (
                    <span>分类内商品</span>
                ) : (
                    <span>搜索商品</span>
                )}
                {categoryId ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onClearCategory}
                    >
                        分类筛选 ×
                    </Button>
                ) : undefined}
                {total === undefined ? undefined : <span>共 {total} 件商品</span>}
                {fetching ? <span>更新中…</span> : undefined}
            </div>
        </div>
    )
}
function SearchPrompt() {
    return (
        <Empty className="py-20">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>输入关键词开始搜索</EmptyTitle>
                <EmptyDescription>也可以从首页分类词条进入分类内搜索。</EmptyDescription>
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
    return (
        <Empty className="py-20">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>{q ? `没有找到「${q}」相关的商品` : "这个分类暂时没有商品"}</EmptyTitle>
                <EmptyDescription>换个关键词或条件试试。</EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-wrap items-center justify-center gap-2">
                {q ? <Button onClick={onClearKeyword}>清除关键词</Button> : undefined}
                {categoryId ? (
                    <Button
                        variant="outline"
                        onClick={onClearCategory}
                    >
                        移除分类筛选
                    </Button>
                ) : undefined}
                <Button
                    variant="ghost"
                    onClick={onClearAll}
                >
                    清空全部条件
                </Button>
            </div>
        </Empty>
    )
}
