import { useMemo, useState } from "react"
import { CircleHelp, Maximize2, Minimize2, Search } from "lucide-react"
import {
    Button,
    Input,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"

import type { SkuDraftRow } from "./product-form-state"

/**
 * 销售规格网格（完全受控）：工具栏（批量填写价格/数量 + 搜索 + 全屏）+
 * 规格 | 价格 | 数量 | 商家编码 | SKU分类 | 是否上架 | 操作（删除）。
 *
 * rows 由外层(use-product-draft)持有，本组件不存值；任何编辑都 onChange 上抛新的行数组，
 * 供外层 autosave 落库。BatchPrice/搜索/全屏为纯 UI 瞬态，保留自持（不影响草稿）。
 *
 * 说明：SKU分类 后端模型尚无对应字段，先渲染禁用占位；删除为移除该行（不随更新上报）。
 */
export function SkuGridEditor({
    rows,
    onChange,
}: {
    rows: SkuDraftRow[]
    onChange: (rows: SkuDraftRow[]) => void
}) {
    const [batchPrice, setBatchPrice] = useState("")
    const [batchStock, setBatchStock] = useState("")
    const [keyword, setKeyword] = useState("")
    const [fullscreen, setFullscreen] = useState(false)

    function update(index: number, patch: Partial<SkuDraftRow>) {
        onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    }

    /** 删除规格行：移除该行（不随后续更新上报），重新选值生成网格可找回 */
    function remove(index: number) {
        onChange(rows.filter((_, i) => i !== index))
    }

    /** 批量填写：把工具栏里的价格/数量回填到所有行（留空的字段不覆盖） */
    function applyBatch() {
        onChange(
            rows.map((r) => ({
                ...r,
                priceText: batchPrice.trim() ? batchPrice.trim() : r.priceText,
                stockText: batchStock.trim()
                    ? batchStock.trim().replaceAll(/\D/g, "")
                    : r.stockText,
            })),
        )
    }

    const visible = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return rows.map((d, i) => ({ d, i }))
        return rows
            .map((d, i) => ({ d, i }))
            .filter(
                ({ d }) =>
                    d.label.toLowerCase().includes(kw) || d.skuCode.toLowerCase().includes(kw),
            )
    }, [rows, keyword])

    if (rows.length === 0) return

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
                                <Switch
                                    checked={d.status !== "DISABLED"}
                                    onClick={() =>
                                        update(i, {
                                            status: d.status === "ON_SALE" ? "DISABLED" : "ON_SALE",
                                        })
                                    }
                                    aria-label="是否上架"
                                ></Switch>
                            </TableCell>
                            <TableCell>
                                <Button
                                    variant="link"
                                    onClick={() => remove(i)}
                                >
                                    删除
                                </Button>
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
