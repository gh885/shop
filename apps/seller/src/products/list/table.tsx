import {
    Badge,
    Button,
    Pagination as UiPagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"

import { priceRangeText } from "@shop/api"
import type { ProductResponse } from "@shop/api/sdk"

import { imgUrl } from "#/shared/lib/image"

// ---------- 状态展示 ----------

const STATUS_META: Record<
    ProductResponse["status"],
    { label: string; variant: "default" | "secondary" | "outline" }
> = {
    PUBLISHED: { label: "上架中", variant: "default" },
    WAREHOUSE: { label: "仓库中", variant: "secondary" },
    DRAFT: { label: "草稿", variant: "outline" },
}

interface ProductTableProps {
    /** 当前页商品行（已含后端聚合好的库存/销量） */
    rows: ProductResponse[]
    /** 当前页码（1 起）与每页条数 */
    page: number
    pageSize: number
    /** 总数（共 N 件商品） */
    total: number
    /** 单个商品正在执行的动作（如下架中），用于禁用对应行按钮 */
    busyId?: string
    /** 编辑：跳发布页回显 */
    onEdit: (id: string) => void
    onOff: (id: string) => void
    onOn: (id: string) => void
    onPageChange: (page: number) => void
}

/**
 * 商品列表主表格：商品名称（图+名+ID）/ 价格 / 库存 / 累计销量 / 创建时间（时间+状态）/ 操作。
 * 纯展示 + 事件上抛：数据与分页状态由容器持有（URL 同步），本组件不拉数据不写 URL。
 */
export function ProductTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onEdit,
    onOff,
    onOn,
    onPageChange,
}: ProductTableProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-72">商品名称</TableHead>
                        <TableHead>单价</TableHead>
                        <TableHead>库存</TableHead>
                        <TableHead>累计销量</TableHead>
                        <TableHead className="min-w-52">创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((p) => (
                        <ProductRow
                            key={p.id}
                            product={p}
                            busy={p.id === busyId}
                            onEdit={() => onEdit(p.id)}
                            onOff={() => onOff(p.id)}
                            onOn={() => onOn(p.id)}
                        />
                    ))}
                </TableBody>
            </Table>

            <div className="border-t border-border px-4 py-3">
                <div className="mb-2 text-sm text-muted-foreground tabular-nums">
                    共 {total} 件商品
                </div>
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                />
            </div>
        </div>
    )
}

/** 单行：图片缩略 + 名称 + ID；价格区间；库存；销量；创建时间 + 状态徽章；行内操作（编辑 + 状态动作） */
function ProductRow({
    product: p,
    busy,
    onEdit,
    onOff,
    onOn,
}: {
    product: ProductResponse
    busy: boolean
    onEdit: () => void
    onOff: () => void
    onOn: () => void
}) {
    const meta = STATUS_META[p.status]

    return (
        <TableRow>
            {/* 商品名称：图 + 名 + ID */}
            <TableCell>
                <div className="flex items-start gap-3">
                    <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        {p.mainImage ? (
                            <img
                                src={imgUrl(p.mainImage)}
                                alt={p.name}
                                className="size-full object-cover"
                            />
                        ) : undefined}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">ID: {p.id}</p>
                    </div>
                </div>
            </TableCell>

            {/* 单价：单 SKU 同价只显一个 */}
            <TableCell className="tabular-nums">{priceRangeText(p.minPrice, p.maxPrice)}</TableCell>
            <TableCell className="tabular-nums">{p.stock}</TableCell>
            <TableCell className="tabular-nums">{p.soldCount}</TableCell>

            {/* 创建时间：日期 + 状态徽章 */}
            <TableCell>
                <div className="space-y-0.5">
                    <span className="block text-sm tabular-nums">
                        {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
            </TableCell>

            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {/* 编辑：跳发布页回显，任何状态可用 */}
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={onEdit}
                    >
                        编辑
                    </Button>
                    {/* 状态动作：上架中→下架；仓库中→上架；草稿无状态动作 */}
                    {p.status === "PUBLISHED" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOff}
                        >
                            下架
                        </Button>
                    ) : p.status === "WAREHOUSE" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOn}
                            className="text-primary hover:text-primary"
                        >
                            上架
                        </Button>
                    ) : undefined}
                </div>
            </TableCell>
        </TableRow>
    )
}

/** 底部分页：用 ui-web Pagination 组件（上一页 / 页码带省略 / 下一页）。点击经 onPageChange 写回 URL。 */
function Pagination({
    page,
    totalPages,
    onPageChange,
}: {
    page: number
    totalPages: number
    onPageChange: (page: number) => void
}) {
    const pages = paged(page, totalPages)

    // PaginationLink 渲染 <a>，点击时阻止默认跳转交 onPageChange；越界（上/下一页已禁用）不触发
    const go = (target: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        if (target >= 1 && target <= totalPages) onPageChange(target)
    }

    return (
        <UiPagination className="mx-0 justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        text="上一页"
                        aria-disabled={page <= 1}
                        href={page > 1 ? `#?page=${page - 1}` : undefined}
                        onClick={go(page - 1)}
                    />
                </PaginationItem>
                {pages.map((p, i) =>
                    p === "..." ? (
                        <PaginationItem key={`e${i}`}>
                            <PaginationEllipsis />
                        </PaginationItem>
                    ) : (
                        <PaginationItem key={p}>
                            <PaginationLink
                                isActive={p === page}
                                href={`#?page=${p}`}
                                onClick={go(p)}
                            >
                                {p}
                            </PaginationLink>
                        </PaginationItem>
                    ),
                )}
                <PaginationItem>
                    <PaginationNext
                        text="下一页"
                        aria-disabled={page >= totalPages}
                        href={page < totalPages ? `#?page=${page + 1}` : undefined}
                        onClick={go(page + 1)}
                    />
                </PaginationItem>
            </PaginationContent>
        </UiPagination>
    )
}

/** 页码序列：当前页 ±2 + 首尾 + 省略号。返回数字与 "..." 的混合数组。 */
function paged(current: number, total: number): (number | "...")[] {
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
    if (total <= 7) return range(1, total)
    const pages = new Set<number>([1, total])
    for (let p = current - 2; p <= current + 2; p++) {
        if (p >= 1 && p <= total) pages.add(p)
    }
    const sorted = [...pages].sort((a, b) => a - b)
    const out: (number | "...")[] = []
    let prev = 0
    for (const p of sorted) {
        if (p - prev > 1) out.push("...")
        out.push(p)
        prev = p
    }
    return out
}
