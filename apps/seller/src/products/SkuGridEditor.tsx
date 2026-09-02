import { useEffect, useMemo, useState } from "react"
import { CircleHelp, Maximize2, Minimize2, Search } from "lucide-react"
import {
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { fenToYuan } from "@shop/api"

import type { SkuUpdateItem, SkuResponse } from "@shop/api/sdk"

interface RowDraft {
    skuId: string
    label: string
    priceText: string
    stockText: string
    skuCode: string
    status: "ON_SALE" | "DISABLED"
}

function toDrafts(rows: SkuResponse[]): RowDraft[] {
    return rows.map((r) => ({
        skuId: r.id as string,
        label: (r.attributes ?? []).map((a) => a.value).join(" / ") || "单规格",
        priceText: r.price == null ? "" : fenToYuan(r.price),
        stockText: r.stock == null ? "" : String(r.stock),
        skuCode: r.skuCode ?? "",
        status: r.status === "DISABLED" ? "DISABLED" : "ON_SALE",
    }))
}

/**
 * 销售规格网格（受控）：工具栏（批量填写价格/数量 + 搜索 + 全屏）+
 * 规格 | 价格 | 数量 | 商家编码 | SKU分类 | 是否上架 | 操作（删除）。
 * skus 由服务端 applySpecs 生成后传入，值由父级持有（onChange 上报），便于随发布一次提交。
 *
 * 说明：SKU分类 后端模型尚无对应字段，先渲染禁用占位；批量填写为纯前端批量回填；
 * 删除为本地移除（该行不随 updateSkus 上报），重新选值生成网格可找回。
 */
export function SkuGridEditor({
    rows,
    onChange,
}: {
    rows: SkuResponse[]
    onChange: (items: SkuUpdateItem[]) => void
}) {
    const [drafts, setDrafts] = useState<RowDraft[]>(() => toDrafts(rows))
    const [batchPrice, setBatchPrice] = useState("")
    const [batchStock, setBatchStock] = useState("")
    const [keyword, setKeyword] = useState("")
    const [fullscreen, setFullscreen] = useState(false)

    useEffect(() => setDrafts(toDrafts(rows)), [rows])

    function update(index: number, patch: Partial<RowDraft>) {
        setDrafts((ds) => ds.map((d, i) => (i === index ? { ...d, ...patch } : d)))
    }

    /** 删除规格行：本地移除（不随 updateSkus 上报），重新选值生成网格可找回 */
    function remove(index: number) {
        setDrafts((ds) => ds.filter((_, i) => i !== index))
    }

    /** 批量填写：把工具栏里的价格/数量回填到所有行（留空的字段不覆盖） */
    function applyBatch() {
        setDrafts((ds) =>
            ds.map((d) => ({
                ...d,
                priceText: batchPrice.trim() ? batchPrice.trim() : d.priceText,
                stockText: batchStock.trim()
                    ? batchStock.trim().replaceAll(/\D/g, "")
                    : d.stockText,
            })),
        )
    }

    // 草稿变化即上报 items（父级在发布时读取）
    useEffect(() => {
        onChange(
            drafts.map((d) => ({
                skuId: d.skuId,
                price: Number(d.priceText),
                stock: Number(d.stockText) || 0,
                skuCode: d.skuCode.trim() || undefined,
                status: d.status,
            })),
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drafts])

    const visible = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return drafts.map((d, i) => ({ d, i }))
        return drafts
            .map((d, i) => ({ d, i }))
            .filter(
                ({ d }) =>
                    d.label.toLowerCase().includes(kw) || d.skuCode.toLowerCase().includes(kw),
            )
    }, [drafts, keyword])

    if (rows.length === 0) return null

    const content = (
        <div className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-background p-6" : ""}>
            {/* 工具栏：批量填写 + 搜索 + 全屏 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                    <span className="pl-3 text-sm text-muted-foreground">价格</span>
                    <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        className="h-9 w-24 border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0"
                        value={batchPrice}
                        onChange={(e) => setBatchPrice(e.target.value)}
                    />
                    <span className="pr-3 text-sm text-muted-foreground">元</span>
                </div>
                <div className="flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                    <span className="pl-3 text-sm text-muted-foreground">数量</span>
                    <Input
                        inputMode="numeric"
                        placeholder="0"
                        className="h-9 w-20 border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0"
                        value={batchStock}
                        onChange={(e) => setBatchStock(e.target.value)}
                    />
                    <span className="pr-3 text-sm text-muted-foreground">件</span>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyBatch}
                    disabled={!batchPrice.trim() && !batchStock.trim()}
                >
                    批量填写
                </Button>

                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                        <Input
                            placeholder="搜索规格 / 编码"
                            className="h-9 w-44 border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                        <Search className="mr-3 size-4 shrink-0 text-muted-foreground/60" />
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => setFullscreen((f) => !f)}
                    >
                        {fullscreen ? (
                            <>
                                <Minimize2 className="size-4" />
                                退出全屏
                            </>
                        ) : (
                            <>
                                <Maximize2 className="size-4" />
                                全屏
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>规格</TableHead>
                        <TableHead className="w-36">
                            价格<span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="w-32">
                            数量<span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="w-36">商家编码</TableHead>
                        <TableHead className="w-28">
                            SKU分类
                            <CircleHelp className="ml-1 inline size-3.5 text-muted-foreground/60" />
                        </TableHead>
                        <TableHead className="w-24">是否上架</TableHead>
                        <TableHead className="w-16">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visible.map(({ d, i }) => (
                        <TableRow key={d.skuId}>
                            <TableCell>
                                <span className="flex items-center gap-2">
                                    <span
                                        className="size-8 shrink-0 rounded-md bg-muted"
                                        aria-hidden
                                    />
                                    <span className="font-medium">{d.label}</span>
                                </span>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <Input
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="w-28 tabular-nums"
                                        value={d.priceText}
                                        onChange={(e) => update(i, { priceText: e.target.value })}
                                    />
                                    <span className="shrink-0 text-sm text-muted-foreground">
                                        元
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1">
                                    <Input
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-24 tabular-nums"
                                        value={d.stockText}
                                        onChange={(e) =>
                                            update(i, {
                                                stockText: e.target.value.replaceAll(/\D/g, ""),
                                            })
                                        }
                                    />
                                    <span className="shrink-0 text-sm text-muted-foreground">
                                        件
                                    </span>
                                </div>
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
                                <Input
                                    disabled
                                    value="单品"
                                    title="SKU分类待后端支持"
                                    className="text-muted-foreground"
                                />
                            </TableCell>
                            <TableCell>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={d.status === "ON_SALE"}
                                    aria-label="是否上架"
                                    onClick={() =>
                                        update(i, {
                                            status: d.status === "ON_SALE" ? "DISABLED" : "ON_SALE",
                                        })
                                    }
                                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                                        d.status === "ON_SALE"
                                            ? "bg-primary"
                                            : "bg-muted-foreground/30"
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                                            d.status === "ON_SALE" ? "left-[22px]" : "left-0.5"
                                        }`}
                                    />
                                </button>
                            </TableCell>
                            <TableCell>
                                <button
                                    type="button"
                                    onClick={() => remove(i)}
                                    className="text-sm text-primary hover:underline"
                                >
                                    删除
                                </button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {visible.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的规格</p>
            )}
        </div>
    )

    return content
}
