import { useState } from "react"
import { CircleHelp, Maximize2, Minimize2, Search } from "lucide-react"
import { type Money, moneyToYuan, sameMoney } from "@shop/common"
import { notify } from "@shop/app-kit"
import {
    Button,
    Empty,
    EmptyTitle,
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    cn,
} from "@shop/ui-web"

import {
    parseBatchFill,
    parseCountCell,
    parsePriceCell,
    selectVisibleSkuRows,
} from "#/product/draft-model"
import { SKU_CODE_MAX } from "#/product/constants"
import type { SkuDraftRow } from "#/product/draft-model"

/**
 * 销售规格网格（完全受控）：工具栏（批量填写价格/数量 + 搜索 + 全屏）+
 * 规格 | 价格 | 数量 | 商家编码 | SKU分类 | 是否上架 | 操作（删除）。
 *
 * rows 由外层(use-product-draft)持有，本组件不存值；任何编辑都 onChange 上抛新的行数组。
 *
 * 分/元换算的边界在此：模型存「分」与 null，单元格内用本地文本态
 * 承接输入（PriceCell/QuantityCell），失焦才解析回分提交——编辑中途不打断输入。
 *
 * 说明：SKU分类 后端模型尚无对应字段，先渲染禁用占位；删除为移除该行（不随更新上报）。
 */

// 输入边界：元/件字符串 → 模型的换算判据在 draft-model 的 parse*Cell，本文件只决定「什么时候提交」
/** 单元格文本校验失败时：提示 + 不提交（与“空 = 清空”区分开，输入不会被静默吞掉） */
function rejectInput(message: string | undefined): void {
    notify.error(message ?? "输入格式不正确")
}

/** 价格单元格：文本态只在输入期间驻留，blur 才校验并换算回 Money */
function PriceCell({
    value,
    onCommit,
}: {
    value: Money | null
    onCommit: (price: Money | null) => void
}) {
    const [text, setText] = useState<string | undefined>(undefined)
    // 非编辑期显示模型值（Money → 元两位小数，无符号：输入框后面有「元」单位）；编辑期显示用户正在输入的文本
    const shown = text ?? moneyToYuan(value)
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
                    const cell = parsePriceCell(text)
                    setText(undefined)
                    if (cell.error !== undefined) {
                        rejectInput(cell.error)
                        return
                    }
                    // 按值比再提交：Money 是普通对象，重新解析必得新引用；清空也只在真有值时算一次改动
                    if (cell.value === null ? value !== null : !sameMoney(cell.value, value))
                        onCommit(cell.value)
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
                    const cell = parseCountCell(text)
                    setText(undefined)
                    if (cell.error !== undefined) {
                        rejectInput(cell.error)
                        return
                    }
                    if (cell.value === null ? value !== null : cell.value !== value)
                        onCommit(cell.value)
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

    /** 批量填写：判据在 draft-model 的 parseBatchFill（非法输入提示且整批不落，空的不覆盖） */
    function applyBatch() {
        const batch = parseBatchFill(batchPrice, batchStock)
        if (batch.error !== undefined) {
            rejectInput(batch.error)
            return
        }
        if (batch.price === undefined && batch.stock === undefined) return
        onChange(
            rows.map((r) => ({
                ...r,
                price: batch.price ?? r.price,
                stock: batch.stock ?? r.stock,
            })),
        )
    }

    const visible = selectVisibleSkuRows(rows, keyword)

    if (rows.length === 0) return

    const content = (
        <div className={cn(fullscreen && "fixed inset-0 z-50 overflow-auto bg-background p-6")}>
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
                    {visible.map(({ row: d, index: i }) => (
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
                                    maxLength={SKU_CODE_MAX}
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
                                <Tooltip>
                                    <TooltipTrigger
                                        render={
                                            <Input
                                                disabled
                                                value="单品"
                                            />
                                        }
                                    />
                                    <TooltipContent>SKU分类待后端支持</TooltipContent>
                                </Tooltip>
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
                <Empty className="gap-0 py-6">
                    <EmptyTitle>没有匹配的规格</EmptyTitle>
                </Empty>
            )}
        </div>
    )

    return content
}
