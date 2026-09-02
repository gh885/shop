import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import {
    Badge,
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    StateError,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { ChevronLeft, ChevronRight, Package, Plus, Search, Store } from "lucide-react"

import { priceRangeText, toApiError } from "@shop/api"

import { listProducts, offProduct, onProduct, publishProduct } from "#/products/data"
import { useCurrentShop } from "#/shared/lib/shop"
import type { ProductResponse } from "@shop/api/sdk"

interface ProductSearch {
    page: number
    size: number
    status?: ProductResponse["status"]
    keyword?: string
}

export const Route = createFileRoute("/_app/product/list")({
    validateSearch: (search: Record<string, unknown>): ProductSearch => ({
        page: Number(search.page) || 1,
        size: Number(search.size) || 10,
        status:
            search.status === "PUBLISHED" || search.status === "OFF" || search.status === "DRAFT"
                ? search.status
                : undefined,
        keyword: typeof search.keyword === "string" && search.keyword ? search.keyword : undefined,
    }),
    component: ProductsPage,
})

const STATUS_TEXT: Record<ProductResponse["status"], string> = {
    PUBLISHED: "上架中",
    OFF: "已下架",
    DRAFT: "草稿",
}

const STATUS_VARIANT: Record<ProductResponse["status"], "default" | "outline" | "secondary"> = {
    PUBLISHED: "default",
    OFF: "outline",
    DRAFT: "secondary",
}

function ProductsPage() {
    const shop = useCurrentShop()
    const search = Route.useSearch()

    if (!shop) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Store className="size-10 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                    还没有正常营业的店铺，先到「店铺管理」创建或等待审核
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">商品管理</h1>
                    <p className="mt-1 text-sm text-muted-foreground">「{shop.name}」的商品</p>
                </div>
                <Link to="/product/create">
                    <Button>
                        <Plus className="size-4" />
                        新建商品
                    </Button>
                </Link>
            </div>

            <FilterBar />
            <ProductTable
                key={shop.id}
                shopId={shop.id}
                search={search}
            />
        </div>
    )
}

/** 筛选栏：状态 + 名称关键词，提交后写回 URL search */
function FilterBar() {
    const navigate = useNavigate()
    const search = Route.useSearch()
    const [keyword, setKeyword] = useState(search.keyword ?? "")

    function apply(next: Partial<ProductSearch>) {
        void navigate({
            to: "/product/list",
            search: {
                page: 1,
                size: search.size,
                status: search.status,
                keyword: search.keyword,
                ...next,
            },
            replace: true,
        })
    }

    return (
        <div className="flex items-center gap-3">
            <Select
                value={search.status ?? "all"}
                onValueChange={(value) =>
                    apply({
                        status: value === "all" ? undefined : (value as ProductResponse["status"]),
                    })
                }
            >
                <SelectTrigger className="w-32">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="PUBLISHED">上架中</SelectItem>
                    <SelectItem value="OFF">已下架</SelectItem>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                </SelectContent>
            </Select>

            <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    apply({ keyword: keyword.trim() || undefined })
                }}
            >
                <Input
                    className="w-64"
                    placeholder="按商品名搜索"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                />
                <Button
                    type="submit"
                    variant="outline"
                >
                    <Search className="size-4" />
                    搜索
                </Button>
            </form>
        </div>
    )
}

function ProductTable({ shopId, search }: { shopId: string; search: ProductSearch }) {
    const queryClient = useQueryClient()

    const products = useQuery({
        queryKey: ["products", shopId, search],
        queryFn: () => listProducts(shopId, search),
        placeholderData: keepPreviousData,
    })

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products", shopId] })

    const publish = useMutation({
        mutationFn: (id: string) => publishProduct(shopId, id),
        onSuccess: invalidate,
    })
    const off = useMutation({
        mutationFn: (id: string) => offProduct(shopId, id),
        onSuccess: invalidate,
    })
    const on = useMutation({
        mutationFn: (id: string) => onProduct(shopId, id),
        onSuccess: invalidate,
    })

    if (products.isLoading) {
        return (
            <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-14 w-full rounded-xl"
                    />
                ))}
            </div>
        )
    }

    if (products.isError) {
        return (
            <StateError
                message={toApiError(products.error).detail}
                onRetry={() => void products.refetch()}
                retrying={products.isFetching}
            />
        )
    }

    const records = products.data?.records ?? []
    const total = products.data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / search.size))

    if (records.length === 0) {
        return (
            <Empty className="rounded-2xl border-border py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Package />
                    </EmptyMedia>
                    <EmptyTitle>
                        {search.keyword || search.status !== undefined
                            ? "没有符合条件的商品"
                            : "还没有商品"}
                    </EmptyTitle>
                    <EmptyDescription>
                        {search.keyword || search.status !== undefined
                            ? "换个筛选条件试试"
                            : "点右上角「新建商品」开始"}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <>
            <div className="rounded-2xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>商品</TableHead>
                            <TableHead>价格</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>更新时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {records.map((p) => (
                            <ProductRow
                                key={p.id}
                                product={p}
                                busy={publish.isPending || off.isPending || on.isPending}
                                onPublish={() => publish.mutate(p.id)}
                                onOff={() => off.mutate(p.id)}
                                onOn={() => on.mutate(p.id)}
                            />
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="tabular-nums">共 {total} 件商品</span>
                <div className="flex items-center gap-2">
                    <PaginationButton
                        page={search.page}
                        target={search.page - 1}
                        disabled={search.page <= 1}
                    >
                        <ChevronLeft className="size-4" />
                        上一页
                    </PaginationButton>
                    <span className="tabular-nums">
                        {search.page} / {totalPages}
                    </span>
                    <PaginationButton
                        page={search.page}
                        target={search.page + 1}
                        disabled={search.page >= totalPages}
                    >
                        下一页
                        <ChevronRight className="size-4" />
                    </PaginationButton>
                </div>
            </div>
        </>
    )
}

function PaginationButton({
    target,
    disabled,
    children,
}: {
    page: number
    target: number
    disabled: boolean
    children: React.ReactNode
}) {
    const search = Route.useSearch()
    return (
        <Link
            to="/product/list"
            search={{ ...search, page: target }}
            disabled={disabled}
        >
            <Button
                variant="outline"
                size="sm"
                disabled={disabled}
            >
                {children}
            </Button>
        </Link>
    )
}

function ProductRow({
    product: p,
    busy,
    onPublish,
    onOff,
    onOn,
}: {
    product: ProductResponse
    busy: boolean
    onPublish: () => void
    onOff: () => void
    onOn: () => void
}) {
    return (
        <TableRow>
            <TableCell>
                <div className="space-y-0.5">
                    <span className="font-medium">{p.name}</span>
                    {p.subtitle ? (
                        <p className="max-w-md truncate text-xs text-muted-foreground">
                            {p.subtitle}
                        </p>
                    ) : undefined}
                </div>
            </TableCell>
            <TableCell className="tabular-nums">{priceRangeText(p.minPrice, p.maxPrice)}</TableCell>
            <TableCell>
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_TEXT[p.status]}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
                {new Date(p.updatedAt).toLocaleString("zh-CN")}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {p.status === "DRAFT" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onPublish}
                            className="text-primary hover:text-primary"
                        >
                            发布
                        </Button>
                    ) : p.status === "PUBLISHED" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOff}
                        >
                            下架
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOn}
                            className="text-primary hover:text-primary"
                        >
                            上架
                        </Button>
                    )}
                </div>
            </TableCell>
        </TableRow>
    )
}
