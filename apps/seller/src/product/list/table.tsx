import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil } from "lucide-react"

import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import {
    Badge,
    Button,
    confirm,
    Image,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@shop/ui-web"

import { priceRangeText } from "@shop/common/domain"
import type { ProductResponse } from "@shop/api/sdk"
import { cn } from "@shop/ui-web"

import { imgUrl } from "#/shared/lib/image"
import { useT } from "#/locales/use-t"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"
import type { ProductSort } from "#/product/queries"
import { PRODUCT_STATUS_META } from "#/product/constants"

interface ProductTableProps {
    rows: ProductResponse[]
    page: number
    pageSize: number
    total: number
    busyId?: string
    sort?: ProductSort
    onEdit: (id: string) => void
    onEditTitle: (product: ProductTitleTarget) => void
    onEditPrice: (product: ProductLineTarget) => void
    onEditStock: (product: ProductLineTarget) => void
    onOff: (id: string) => void
    onOn: (id: string) => void
    onPageChange: (page: number) => void
    onSortChange: (sort: ProductSort) => void
}

export type ProductTitleTarget = Pick<ProductResponse, "id" | "name" | "subtitle">

export type ProductLineTarget = Pick<ProductResponse, "id" | "name">

const titleTarget = (p: ProductResponse): ProductTitleTarget => ({
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
})

const lineTarget = (p: ProductResponse): ProductLineTarget => ({ id: p.id, name: p.name })

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
    const t = useT("product")
    async function confirmOff(p: ProductResponse) {
        const ok = await confirm({
            title: t("product.list.confirm.offShelf.title"),
            description: t("product.list.confirm.offShelf.body", { name: p.name }),
            confirmText: t("product.list.confirm.offShelf.confirm"),
        })
        if (ok) onOff(p.id)
    }

    return (
        <TableCard
            total={total}
            unit={t("product.list.pagination.unit")}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead className="min-w-72">{t("product.list.header.name")}</TableHead>
                    <TableHead>{t("product.list.header.price")}</TableHead>
                    <SortableHeader
                        field="stock"
                        label={t("product.list.header.stock")}
                        sort={sort}
                        onSortChange={onSortChange}
                    />
                    <SortableHeader
                        field="soldCount"
                        label={t("product.list.header.soldCount")}
                        sort={sort}
                        onSortChange={onSortChange}
                    />
                    <SortableHeader
                        field="createdAt"
                        label={t("product.list.header.createdAt")}
                        sort={sort}
                        onSortChange={onSortChange}
                        className="min-w-52"
                    />
                    <TableHead className="text-right">{t("product.list.header.action")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((p) => (
                    <ProductRow
                        key={p.id}
                        product={p}
                        busy={p.id === busyId}
                        onEdit={() => onEdit(p.id)}
                        onEditTitle={() => onEditTitle(titleTarget(p))}
                        onEditPrice={() => onEditPrice(lineTarget(p))}
                        onEditStock={() => onEditStock(lineTarget(p))}
                        onOff={() => confirmOff(p)}
                        onOn={() => onOn(p.id)}
                    />
                ))}
            </TableBody>
        </TableCard>
    )
}

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
    const t = useT("product")
    const prefix = `${field}_`
    const isActive = !!sort && sort.startsWith(prefix)
    const dir = isActive ? sort.slice(prefix.length) : undefined
    const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown
    const dirArg: "asc" | "desc" | "other" =
        dir === "asc" ? "asc" : dir === "desc" ? "desc" : "other"

    return (
        <TableHead className={cn(className)}>
            <button
                type="button"
                onClick={() => {
                    // 未激活列首点进 desc（数值/时间默认看高到低、新到旧），不是 asc
                    onSortChange(`${field}_${dir === "desc" ? "asc" : "desc"}`)
                }}
                aria-label={t("product.list.sort.aria", {
                    label,
                    dir: dirArg,
                })}
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
    const { locale } = useI18n()
    const t = useT("product")
    const meta = PRODUCT_STATUS_META[p.status]

    return (
        <TableRow>
            <TableCell>
                <div className="flex items-start gap-3">
                    <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        <Image
                            src={imgUrl(p.mainImage ?? undefined)}
                            alt={p.name}
                            className="size-full"
                        />
                    </div>
                    <div className="group/name min-w-0 max-w-72 flex-1 space-y-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <CopyableText
                                value={p.name}
                                label={t("product.list.copy.nameLabel")}
                                className="w-auto min-w-0 max-w-full shrink font-medium"
                            />
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            className="size-5"
                                            onClick={onEditTitle}
                                            aria-label={t("product.list.editTitle.aria")}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                    }
                                />
                                <TooltipContent>
                                    {t("product.list.editTitle.tooltip")}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {p.subtitle ? (
                            <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>
                        ) : undefined}
                    </div>
                </div>
            </TableCell>

            <TableCell className="tabular-nums">
                <div className="group/price inline-flex items-center gap-1.5">
                    {priceRangeText(p.minPrice ?? undefined, p.maxPrice ?? undefined, locale) ??
                        "—"}
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-5"
                                    onClick={onEditPrice}
                                    aria-label={t("product.list.editPrice.aria")}
                                >
                                    <Pencil className="size-3.5" />
                                </Button>
                            }
                        />
                        <TooltipContent>{t("product.list.editPrice.tooltip")}</TooltipContent>
                    </Tooltip>
                </div>
            </TableCell>
            <TableCell className="tabular-nums">
                <div className="group/stock inline-flex w-fit items-center gap-1.5">
                    {p.stock}
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-5"
                                    onClick={onEditStock}
                                    aria-label={t("product.list.editStock.aria")}
                                >
                                    <Pencil className="size-3.5" />
                                </Button>
                            }
                        />
                        <TooltipContent>{t("product.list.editStock.tooltip")}</TooltipContent>
                    </Tooltip>
                </div>
            </TableCell>
            <TableCell className="tabular-nums">{p.soldCount}</TableCell>

            <TableCell>
                <div className="space-y-0.5">
                    <span className="block text-muted-foreground tabular-nums">
                        {formatDateTime(p.createdAt, locale)}
                    </span>
                    <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                </div>
            </TableCell>

            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={onEdit}
                    >
                        {t("product.list.action.edit")}
                    </Button>
                    {p.status === "PUBLISHED" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOff}
                        >
                            {t("product.list.action.offShelf")}
                        </Button>
                    ) : p.status === "WAREHOUSE" ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onOn}
                        >
                            {t("product.list.action.onShelf")}
                        </Button>
                    ) : undefined}
                </div>
            </TableCell>
        </TableRow>
    )
}
