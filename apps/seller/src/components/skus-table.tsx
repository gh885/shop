import { useEffect, useState } from "react"
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { CircleAlert } from "lucide-react"

import type { SkuUpdateItem } from "@shop/api/sdk"

import { fenToYuan, yuanToFen } from "@shop/api"
import type { Sku } from "#/domain"

interface SkuDraft {
    skuId: string
    /** 规格取值展示（如 黑色 / L） */
    label: string
    name: string
    skuCode: string
    priceText: string
    originalPriceText: string
    stockText: string
    status: 0 | 1
}

function toDrafts(skus: Sku[]): SkuDraft[] {
    return skus.map((s) => ({
        skuId: s.id,
        label: (s.attributes ?? []).map((a) => a.value).join(" / ") || "单规格",
        name: s.name,
        skuCode: s.skuCode ?? "",
        priceText: s.price === null || s.price === undefined ? "" : fenToYuan(s.price),
        originalPriceText:
            s.originalPrice === null || s.originalPrice === undefined
                ? ""
                : fenToYuan(s.originalPrice),
        stockText: s.stock === null || s.stock === undefined ? "" : String(s.stock),
        status: s.status === 0 ? 0 : 1,
    }))
}

/**
 * SKU 价格/库存批量编辑表。价格输入为「元」，提交时转分。
 * skus 变化（如规格对账后）时重置本地草稿。
 */
export function SkusTable({
    skus,
    submitting,
    onSave,
}: {
    skus: Sku[]
    submitting: boolean
    onSave: (items: SkuUpdateItem[]) => void
}) {
    const [drafts, setDrafts] = useState<SkuDraft[]>(() => toDrafts(skus))
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setDrafts(toDrafts(skus))
        setError(null)
    }, [skus])

    function update(index: number, patch: Partial<SkuDraft>) {
        setDrafts((ds) => ds.map((d, i) => (i === index ? { ...d, ...patch } : d)))
    }

    function handleSave() {
        setError(null)
        const items: SkuUpdateItem[] = []
        for (const d of drafts) {
            const price = yuanToFen(d.priceText)
            if (price === null) {
                setError(`「${d.label}」的价格无效，请输入不小于 0 的金额`)
                return
            }
            const stock = Number(d.stockText)
            if (!d.stockText.trim() || !Number.isInteger(stock) || stock < 0) {
                setError(`「${d.label}」的库存无效，请输入不小于 0 的整数`)
                return
            }
            const originalPrice = d.originalPriceText.trim() ? yuanToFen(d.originalPriceText) : null
            if (d.originalPriceText.trim() && originalPrice === null) {
                setError(`「${d.label}」的划线价无效`)
                return
            }
            items.push({
                skuId: d.skuId,
                name: d.name.trim() || undefined,
                skuCode: d.skuCode.trim() || undefined,
                price,
                // SDK 的 originalPrice 为 number | undefined，null 归一为 undefined
                originalPrice: originalPrice ?? undefined,
                stock,
                status: d.status,
            })
        }
        onSave(items)
    }

    if (skus.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                暂无 SKU。保存规格后会按模板生成 SKU，再来这里设置价格和库存。
            </p>
        )
    }

    return (
        <div className="space-y-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>规格</TableHead>
                        <TableHead className="w-32">售价（元）</TableHead>
                        <TableHead className="w-32">划线价（元）</TableHead>
                        <TableHead className="w-28">库存</TableHead>
                        <TableHead className="w-36">SKU 编码</TableHead>
                        <TableHead className="w-28">状态</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {drafts.map((d, i) => (
                        <TableRow key={d.skuId}>
                            <TableCell className="font-medium">{d.label}</TableCell>
                            <TableCell>
                                <Input
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    className="tabular-nums"
                                    value={d.priceText}
                                    onChange={(e) => update(i, { priceText: e.target.value })}
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    inputMode="decimal"
                                    placeholder="可空"
                                    className="tabular-nums"
                                    value={d.originalPriceText}
                                    onChange={(e) =>
                                        update(i, { originalPriceText: e.target.value })
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="tabular-nums"
                                    value={d.stockText}
                                    onChange={(e) =>
                                        update(i, {
                                            stockText: e.target.value.replaceAll(/\D/g, ""),
                                        })
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    placeholder="可空"
                                    maxLength={64}
                                    value={d.skuCode}
                                    onChange={(e) => update(i, { skuCode: e.target.value })}
                                />
                            </TableCell>
                            <TableCell>
                                <Select
                                    value={String(d.status)}
                                    onValueChange={(v) => update(i, { status: Number(v) as 0 | 1 })}
                                >
                                    <SelectTrigger
                                        size="sm"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">在售</SelectItem>
                                        <SelectItem value="0">停用</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    onClick={handleSave}
                    className="bg-primary text-primary-foreground hover:bg-primary-hover"
                >
                    {submitting ? "保存中…" : "保存价格库存"}
                </Button>
                {error ? (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                        <CircleAlert className="size-4" />
                        {error}
                    </p>
                ) : null}
            </div>
        </div>
    )
}
