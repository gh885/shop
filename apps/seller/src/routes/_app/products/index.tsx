import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import {
    Badge,
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { ChevronLeft, ChevronRight, Package, Plus, Search, Store } from "lucide-react"

import type { Product, ProductStatus } from "@shop/api"

import { priceRangeText, toApiError } from "@shop/api"

import { productApi } from "#/lib/api"
import { useCurrentShop } from "#/lib/shop"

interface ProductSearch {
    page: number
    size: number
    status?: ProductStatus
    keyword?: string
}

export const Route = createFileRoute("/_app/products/")({
    validateSearch: (search: Record<string, unknown>): ProductSearch => ({
        page: Number(search.page) || 1,
        size: Number(search.size) || 10,
        status:
            search.status === 0 || search.status === 1 || search.status === 2
                ? search.status
                : undefined,
        keyword: typeof search.keyword === "string" && search.keyword ? search.keyword : undefined,
    }),
    component: ProductsPage,
})

const STATUS_TEXT: Record<ProductStatus, string> = {
    1: "上架中",
    0: "已下架",
    2: "草稿",
}

const STATUS_VARIANT: Record<ProductStatus, "default" | "outline" | "secondary"> = {
    1: "default",
    0: "outline",
    2: "secondary",
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
                <Link to="/products/new">
                    <Button className="bg-primary text-primary-foreground hover:bg-primary-hover">
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
            to: "/products",
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
                value={search.status === undefined ? "all" : String(search.status)}
                onValueChange={(value) =>
                    apply({
                        status: value === "all" ? undefined : (Number(value) as ProductStatus),
                    })
                }
            >
                <SelectTrigger className="w-32">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="1">上架中</SelectItem>
                    <SelectItem value="0">已下架</SelectItem>
                    <SelectItem value="2">草稿</SelectItem>
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
        queryFn: () => productApi.list(shopId, search),
        placeholderData: keepPreviousData,
    })

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products", shopId] })

    const publish = useMutation({
        mutationFn: (id: string) => productApi.publish(shopId, id),
        onSuccess: invalidate,
    })
    const off = useMutation({
        mutationFn: (id: string) => productApi.off(shopId, id),
        onSuccess: invalidate,
    })
    const on = useMutation({
        mutationFn: (id: string) => productApi.on(shopId, id),
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
        return <ErrorNotice error={products.error} />
    }

    const records = products.data?.records ?? []
    const total = products.data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / search.size))

    if (records.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
                <Package className="size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                    {search.keyword || search.status !== undefined
                        ? "没有符合条件的商品"
                        : "还没有商品，点右上角「新建商品」开始"}
                </p>
            </div>
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
            to="/products"
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
    product: Product
    busy: boolean
    onPublish: () => void
    onOff: () => void
    onOn: () => void
}) {
    return (
        <TableRow>
            <TableCell>
                <div className="space-y-0.5">
                    <Link
                        to="/products/$productId"
                        params={{ productId: p.id }}
                        className="font-medium hover:text-link"
                    >
                        {p.name}
                    </Link>
                    {p.subtitle ? (
                        <p className="max-w-md truncate text-xs text-muted-foreground">
                            {p.subtitle}
                        </p>
                    ) : null}
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
                    <Link
                        to="/products/$productId"
                        params={{ productId: p.id }}
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                        >
                            编辑
                        </Button>
                    </Link>
                    {p.status === 2 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onPublish}
                            className="text-primary hover:text-primary"
                        >
                            发布
                        </Button>
                    ) : p.status === 1 ? (
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

function ErrorNotice({ error }: { error: Error }) {
    return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-subtle p-6 text-sm text-destructive-subtle-foreground">
            {toApiError(error).detail}
        </div>
    )
}
