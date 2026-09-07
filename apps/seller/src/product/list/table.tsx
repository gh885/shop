import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil } from "lucide-react"

import { formatDate } from "@shop/app-kit"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Badge,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"

import { priceRangeText } from "@shop/common"
import type { ProductResponse } from "@shop/api/sdk"
import { cn } from "@shop/ui-web"

import { imgUrl } from "#/shared/lib/image"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TablePagination } from "#/shared/ui/Pagination"
import type { ProductSort } from "#/product/queries"
import { PRODUCT_STATUS_META } from "#/product/constants"

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
    /** 当前排序（URL 同步）：undefined 表示默认（创建时间倒序） */
    sort?: ProductSort
    /** 编辑：跳发布页回显 */
    onEdit: (id: string) => void
    /** 编辑标题/卖点：打开编辑标题弹窗 */
    onEditTitle: (product: ProductResponse) => void
    /** 编辑价格/SKU 编码：打开编辑SKU弹窗 */
    onEditPrice: (product: ProductResponse) => void
    /** 编辑库存：打开编辑库存弹窗 */
    onEditStock: (product: ProductResponse) => void
    onOff: (id: string) => void
    onOn: (id: string) => void
    onPageChange: (page: number) => void
    onSortChange: (sort: ProductSort) => void
}

/**
 * 商品列表主表格：商品名称（图+名+卖点+标题编辑）/ 价格 / 库存 / 累计销量 / 创建时间（时间+状态）/ 操作。
 * 纯展示 + 事件上抛：数据与分页状态由容器持有（URL 同步），本组件不拉数据不写 URL。
 */
export function ProductTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    sort,
    onEdit,
    onEditTitle,
    onEditPrice,
    onEditStock,
    onOff,
    onOn,
    onPageChange,
    onSortChange,
}: ProductTableProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    // 下架二次确认：记录目标商品，确认后才真正执行 onOff
    const [offTarget, setOffTarget] = useState<ProductResponse | undefined>()

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-72">商品名称</TableHead>
                        <TableHead>单价</TableHead>
                        <SortableHeader
                            field="stock"
                            label="库存"
                            sort={sort}
                            onSortChange={onSortChange}
                        />
                        <SortableHeader
                            field="soldCount"
                            label="累计销量"
                            sort={sort}
                            onSortChange={onSortChange}
                        />
                        <SortableHeader
                            field="createdAt"
                            label="创建时间"
                            sort={sort}
                            onSortChange={onSortChange}
                            className="min-w-52"
                        />
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
                            onEditTitle={() => onEditTitle(p)}
                            onEditPrice={() => onEditPrice(p)}
                            onEditStock={() => onEditStock(p)}
                            onOff={() => setOffTarget(p)}
                            onOn={() => onOn(p.id)}
                        />
                    ))}
                </TableBody>
            </Table>

            {/* 下架二次确认 */}
            <AlertDialog
                open={Boolean(offTarget)}
                onOpenChange={(open) => !open && setOffTarget(undefined)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>下架商品</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定下架「{offTarget?.name ?? ""}」吗？买家将无法再购买该商品。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                if (offTarget) onOff(offTarget.id)
                                setOffTarget(undefined)
                            }}
                        >
                            下架
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="border-t border-border px-4 py-3">
                <div className="mb-2 text-sm text-muted-foreground tabular-nums">
                    共 {total} 件商品
                </div>
                <TablePagination
                    page={page}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                />
            </div>
        </div>
    )
}

/** 可排序列头：未激活时中性 ⇅；激活时按 asc/desc 显示单箭头并高亮。点击在 asc/desc 间轮换（未激活列首点进 desc）。 */
function SortableHeader({
    field,
    label,
    sort,
    onSortChange,
    className,
}: {
    field: "stock" | "soldCount" | "createdAt"
    label: string
    sort?: ProductSort
    onSortChange: (sort: ProductSort) => void
    className?: string
}) {
    const prefix = `${field}_`
    const isActive = !!sort && sort.startsWith(prefix)
    const dir = isActive ? sort.slice(prefix.length) : undefined
    const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown

    return (
        <TableHead className={cn(className)}>
            <button
                type="button"
                onClick={() => {
                    // 当前 desc → asc；asc → desc；未激活 → desc（数值/时间默认看高到低、新到旧）
                    onSortChange(`${field}_${dir === "desc" ? "asc" : "desc"}`)
                }}
                aria-label={`${label}排序${dir === "asc" ? "（升序）" : dir === "desc" ? "（降序）" : "，点击降序"}`}
                className="inline-flex items-center gap-1 rounded-sm text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
                {label}
                <Icon
                    className={cn(
                        "size-3.5 shrink-0 transition-colors",
                        dir ? "text-foreground" : "text-muted-foreground/50",
                    )}
                />
            </button>
        </TableHead>
    )
}

/** 单行：图片缩略 + 名称 + ID；价格区间；库存；销量；创建时间 + 状态徽章；行内操作（编辑 + 状态动作） */
function ProductRow({
    product: p,
    busy,
    onEdit,
    onEditTitle,
    onEditPrice,
    onEditStock,
    onOff,
    onOn,
}: {
    product: ProductResponse
    busy: boolean
    onEdit: () => void
    onEditTitle: () => void
    onEditPrice: () => void
    onEditStock: () => void
    onOff: () => void
    onOn: () => void
}) {
    const meta = PRODUCT_STATUS_META[p.status]

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
                    <div className="group/name min-w-0 flex-1 space-y-0.5">
                        {/* 第一项：商品名称（copyable，hover 连接样式可复制）+ 编辑图标，图标紧贴标题（不 flex-1，避免被推到列右端） */}
                        <div className="flex min-w-0 items-center gap-1.5">
                            <CopyableText
                                value={p.name}
                                label="商品名称"
                                className="w-auto min-w-0 max-w-full shrink font-medium"
                            />
                            <button
                                type="button"
                                onClick={onEditTitle}
                                title="编辑标题/卖点"
                                aria-label="编辑标题/卖点"
                                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/name:opacity-100"
                            >
                                <Pencil className="size-3.5" />
                            </button>
                        </div>
                        {/* 第二项：商品卖点（导购标题），空则不展示 */}
                        {p.subtitle ? (
                            <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>
                        ) : undefined}
                    </div>
                </div>
            </TableCell>

            {/* 单价：单 SKU 同价只显一个；hover 出现编辑图标，点击打开编辑SKU弹窗 */}
            <TableCell className="tabular-nums">
                <div className="group/price inline-flex items-center gap-1.5">
                    {priceRangeText(p.minPrice ?? undefined, p.maxPrice ?? undefined)}
                    <button
                        type="button"
                        onClick={onEditPrice}
                        title="编辑价格/SKU编码"
                        aria-label="编辑价格/SKU编码"
                        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/price:opacity-100"
                    >
                        <Pencil className="size-3.5" />
                    </button>
                </div>
            </TableCell>
            {/* 库存：hover 出现编辑图标，点击打开编辑库存弹窗 */}
            <TableCell className="tabular-nums">
                <div className="group/stock inline-flex w-fit items-center gap-1.5">
                    {p.stock}
                    <button
                        type="button"
                        onClick={onEditStock}
                        title="编辑库存"
                        aria-label="编辑库存"
                        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/stock:opacity-100"
                    >
                        <Pencil className="size-3.5" />
                    </button>
                </div>
            </TableCell>
            <TableCell className="tabular-nums">{p.soldCount}</TableCell>

            {/* 创建时间：日期 + 状态徽章 */}
            <TableCell>
                <div className="space-y-0.5">
                    <span className="block text-sm tabular-nums">{formatDate(p.createdAt)}</span>
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
                        >
                            上架
                        </Button>
                    ) : undefined}
                </div>
            </TableCell>
        </TableRow>
    )
}
