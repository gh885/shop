import { Pencil } from "lucide-react"

import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import {
    Badge,
    Button,
    Image,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableShell,
    confirm,
} from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import type { SellerProductItem } from "@shop/api/sdk"

import { imgUrl } from "#/shared/lib/image"
import { useT } from "#/locales/use-t"
import { CopyableText } from "#/shared/ui/CopyableText"
import { PRODUCT_STATUS_META } from "#/domains/product/constants"
import { isProductStatus } from "#/domains/product/rules"

interface ProductTableProps {
    rows: SellerProductItem[]
    nextCursor?: string
    busyId?: string
    onEditTitle: (product: ProductLineTarget) => void
    onEditSku: (product: ProductLineTarget) => void
    onOff: (id: string) => void
    onRelist: (id: string) => void
    onLoadMore: () => void
}

/** 行操作的对象：改标题要标题原文，改 SKU 要 spuId */
export type ProductLineTarget = Pick<SellerProductItem, "spuId" | "title">

const lineTarget = (p: SellerProductItem): ProductLineTarget => ({ spuId: p.spuId, title: p.title })

export function ProductTable({
    rows,
    nextCursor,
    busyId,
    onEditTitle,
    onEditSku,
    onOff,
    onRelist,
    onLoadMore,
}: ProductTableProps) {
    const t = useT("product")
    const { locale } = useI18n()

    async function confirmOff(p: SellerProductItem) {
        const ok = await confirm({
            title: t("product.list.confirm.offShelf.title"),
            description: t("product.list.confirm.offShelf.body", { name: p.title }),
            confirmText: t("product.list.confirm.offShelf.confirm"),
        })
        if (ok) onOff(p.spuId)
    }

    return (
        <TableShell
            footer={
                nextCursor ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLoadMore}
                    >
                        {t("product.list.loadMore")}
                    </Button>
                ) : undefined
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-64">
                            {t("product.list.header.product")}
                        </TableHead>
                        <TableHead>{t("product.list.header.status")}</TableHead>
                        <TableHead className="text-right">
                            {t("product.list.header.price")}
                        </TableHead>
                        <TableHead className="text-right">
                            {t("product.list.header.skuCount")}
                        </TableHead>
                        <TableHead className="text-right">
                            {t("product.list.header.stock")}
                        </TableHead>
                        <TableHead className="min-w-36">
                            {t("product.list.header.createdAt")}
                        </TableHead>
                        <TableHead className="text-right">
                            {t("product.list.header.action")}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((p) => {
                        const statusMeta = isProductStatus(p.status)
                            ? PRODUCT_STATUS_META[p.status]
                            : undefined
                        const busy = p.spuId === busyId
                        return (
                            <TableRow key={p.spuId}>
                                <TableCell>
                                    <div className="flex items-start gap-3">
                                        <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                            <Image
                                                src={imgUrl(p.imageUrl)}
                                                alt={p.title}
                                                className="size-full"
                                            />
                                        </div>
                                        <div className="min-w-0 max-w-64 flex-1 space-y-0.5">
                                            <p
                                                className="truncate font-medium"
                                                title={p.title}
                                            >
                                                {p.title}
                                            </p>
                                            <CopyableText
                                                value={p.spuId}
                                                label={t("product.list.header.product")}
                                                className="text-xs text-muted-foreground"
                                            />
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col items-start gap-1">
                                        {statusMeta ? (
                                            <Badge variant={statusMeta.variant}>
                                                {t(statusMeta.labelKey)}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">{p.status}</Badge>
                                        )}
                                        {p.rejectReason && (
                                            <span
                                                className="max-w-40 truncate text-xs text-destructive"
                                                title={p.rejectReason}
                                            >
                                                {p.rejectReason}
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatMoney(p.minPrice, locale)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {p.skuCount}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {p.availableStock}
                                </TableCell>
                                <TableCell
                                    variant="muted"
                                    className="tabular-nums"
                                >
                                    {formatDateTime(p.createdAt, locale)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => onEditTitle(lineTarget(p))}
                                        >
                                            <Pencil />
                                            {t("product.list.action.editTitle")}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => onEditSku(lineTarget(p))}
                                        >
                                            {t("product.list.action.editSku")}
                                        </Button>
                                        {/* 下架只对已上架有意义；重新提交上架走 relist（回 pending，不直接 online） */}
                                        {p.status === "online" ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy}
                                                onClick={() => void confirmOff(p)}
                                            >
                                                {t("product.list.action.offShelf")}
                                            </Button>
                                        ) : (
                                            p.status === "offline" && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => onRelist(p.spuId)}
                                                >
                                                    {t("product.list.action.relist")}
                                                </Button>
                                            )
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </TableShell>
    )
}
