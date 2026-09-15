import { useState } from "react"
import { CircleHelp, Maximize2, Minimize2, Search } from "lucide-react"
import { fenToYuan } from "@shop/common"
import { notify } from "@shop/app-kit"
import {
    Button,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"

import { countInputSchema, yuanPriceSchema } from "#/product/draft-model"
import type { SkuDraftRow } from "#/product/draft-model"

/**
 * 销售规格网格（完全受控）：工具栏（批量填写价格/数量 + 搜索 + 全屏）+
 * 规格 | 价格 | 数量 | 商家编码 | SKU分类 | 是否上架 | 操作（删除）。
 *
 * rows 由外层(use-product-draft)持有，本组件不存值；任何编辑都 onChange 上抛新的行数组。
 *
 * 分/元换算的边界在此：模型存「分」与 null（见 draft-model），单元格内用本地文本态
 * 承接输入（PriceCell/QuantityCell），失焦才解析回分提交——编辑中途不打断输入。
 *
 * 说明：SKU分类 后端模型尚无对应字段，先渲染禁用占位；删除为移除该行（不随更新上报）。
 */

// ---- 输入边界：元/件字符串 ↔ 分/null，仅出现在本文件 ----

/** 单元格文本校验失败时：提示 + 不提交（与“空 = 清空”区分开，输入不会被静默吞掉） */
function rejectInput(message: string | undefined): void {
    notify.error(message ?? "输入格式不正确")
}

/** 价格单元格：文本态只在输入期间驻留，blur 走 yuanPriceSchema 校验并换算回分 */
function PriceCell({
    value,
    onCommit,
}: {
    value: number | null
    onCommit: (fen: number | null) => void
}) {
    const [text, setText] = useState<string | undefined>(undefined)
    // 非编辑期显示模型值（分 → 元两位小数）；编辑期显示用户正在输入的文本
    const shown = text ?? (value === null ? "" : fenToYuan(value))
    return (
        <InputGroup className="h-9 w-fit">
            <InputGroupInput
                inputMode="decimal"
                placeholder="0.00"
                className="flex-none w-24 text-right tabular-nums"
                value={shown}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                    if (text === undefined) return
                    const raw = text.trim()
                    setText(undefined)
                    if (raw === "") {
                        // 空 = 清空（未设价）；仅在真的有值时提交，避免无谓重建行
                        // oxlint-disable-next-line no-null -- 模型契约：null = 未设价（draft-model 设计），清空提交 null
                        if (value !== null) onCommit(null)
                        return
                    }
                    const parsed = yuanPriceSchema.safeParse(raw)
                    if (!parsed.success) {
                        rejectInput(parsed.error.issues[0]?.message)
                        return
                    }
                    if (parsed.data !== value) onCommit(parsed.data)
                }}
            />
            <InputGroupAddon
                align="inline-end"
                variant="quiet"
            >
                元
            </InputGroupAddon>
        </InputGroup>
    )
}

/** 数量单元格：同价格，仅整数 */
function QuantityCell({
    value,
    onCommit,
}: {
    value: number | null
    onCommit: (count: number | null) => void
}) {
    const [text, setText] = useState<string | undefined>(undefined)
    const shown = text ?? (value === null ? "" : String(value))
    return (
        <InputGroup className="h-9 w-fit">
            <InputGroupInput
                inputMode="numeric"
                placeholder="0"
                className="flex-none w-24 text-right tabular-nums"
                value={shown}
                onChange={(e) => setText(e.target.value.replaceAll(/\D/g, ""))}
                onBlur={() => {
                    if (text === undefined) return
                    const raw = text.trim()
                    setText(undefined)
                    if (raw === "") {
                        // oxlint-disable-next-line no-null -- 模型契约：null = 未填（draft-model 设计），清空提交 null
                        if (value !== null) onCommit(null)
                        return
                    }
                    const parsed = countInputSchema.safeParse(raw)
                    if (!parsed.success) {
                        rejectInput(parsed.error.issues[0]?.message)
                        return
                    }
                    if (parsed.data !== value) onCommit(parsed.data)
                }}
            />
            <InputGroupAddon
                align="inline-end"
                variant="quiet"
            >
                件
            </InputGroupAddon>
        </InputGroup>
    )
}

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

    /** 批量填写：价格/数量各自走 schema 校验（非法输入提示且整批不落），空的不覆盖 */
    function applyBatch() {
        const priceText = batchPrice.trim()
        const stockText = batchStock.replaceAll(/\D/g, "")
        let price: number | undefined = undefined
        let stock: number | undefined = undefined
        if (priceText) {
            const parsed = yuanPriceSchema.safeParse(priceText)
            if (!parsed.success) {
                rejectInput(parsed.error.issues[0]?.message)
                return
            }
            price = parsed.data
        }
        if (stockText) {
            const parsed = countInputSchema.safeParse(stockText)
            if (!parsed.success) {
                rejectInput(parsed.error.issues[0]?.message)
                return
            }
            stock = parsed.data
        }
        if (price === undefined && stock === undefined) return
        onChange(rows.map((r) => ({ ...r, price: price ?? r.price, stock: stock ?? r.stock })))
    }

    const visible = (() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return rows.map((d, i) => ({ d, i }))
        return rows
            .map((d, i) => ({ d, i }))
            .filter(
                ({ d }) =>
                    d.label.toLowerCase().includes(kw) ||
                    (d.skuCode ?? "").toLowerCase().includes(kw),
            )
    })()

    if (rows.length === 0) return

    const content = (
        <div className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-background p-6" : ""}>
            {/* 工具栏：批量填写 + 搜索 + 全屏 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <InputGroup className="h-9 w-fit">
                    <InputGroupAddon
                        align="inline-start"
                        variant="quiet"
                    >
                        价格
                    </InputGroupAddon>
                    <InputGroupInput
                        inputMode="decimal"
                        placeholder="0.00"
                        className="flex-none w-24 text-right tabular-nums"
                        value={batchPrice}
                        onChange={(e) => setBatchPrice(e.target.value)}
                    />
                    <InputGroupAddon
                        align="inline-end"
                        variant="quiet"
                    >
                        元
                    </InputGroupAddon>
                </InputGroup>
                <InputGroup className="h-9 w-fit">
                    <InputGroupAddon
                        align="inline-start"
                        variant="quiet"
                    >
                        数量
                    </InputGroupAddon>
                    <InputGroupInput
                        inputMode="numeric"
                        placeholder="0"
                        className="flex-none w-20 text-right tabular-nums"
                        value={batchStock}
                        onChange={(e) => setBatchStock(e.target.value.replaceAll(/\D/g, ""))}
                    />
                    <InputGroupAddon
                        align="inline-end"
                        variant="quiet"
                    >
                        件
                    </InputGroupAddon>
                </InputGroup>
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
                    <InputGroup className="h-9 w-44">
                        <InputGroupInput
                            placeholder="搜索规格 / 编码"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                        <InputGroupAddon align="inline-end">
                            <Search className="size-4 text-muted-foreground/60" />
                        </InputGroupAddon>
                    </InputGroup>
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
                        <TableHead className="w-36 required-mark">价格</TableHead>
                        <TableHead className="w-32 required-mark">数量</TableHead>
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
                        <TableRow key={d.skuId ?? i}>
                            <TableCell>
                                <span className="flex items-center gap-2">
                                    <span className="font-medium">{d.label}</span>
                                </span>
                            </TableCell>
                            <TableCell>
                                <PriceCell
                                    value={d.price}
                                    onCommit={(price) => update(i, { price })}
                                />
                            </TableCell>
                            <TableCell>
                                <QuantityCell
                                    value={d.stock}
                                    onCommit={(stock) => update(i, { stock })}
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    placeholder="可空"
                                    maxLength={64}
                                    value={d.skuCode ?? ""}
                                    onChange={(e) =>
                                        update(i, {
                                            // oxlint-disable-next-line no-null -- 模型契约：skuCode 可空（string | null），空串 = 清空
                                            skuCode: e.target.value === "" ? null : e.target.value,
                                        })
                                    }
                                    className="tabular-nums"
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    disabled
                                    value="单品"
                                    title="SKU分类待后端支持"
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
