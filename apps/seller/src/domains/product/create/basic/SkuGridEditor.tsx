import type { CheckedMessageFact } from "@shop/i18n"
import { useState } from "react"
import { CircleHelp, Maximize2, Minimize2, Search } from "lucide-react"
import { type Money, moneyToYuan, sameMoney } from "@shop/common/domain"
import { notify } from "@shop/app-kit/data"
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

import { parseBatchFill, parseCountCell, parsePriceCell } from "#/domains/product/form"
import { skuDisplayLabel } from "#/domains/product/display"
import { SKU_CODE_MAX } from "#/domains/product/constants"
import type { SkuDraftRow } from "#/domains/product/draft-rules"
import { selectVisibleSkuRows } from "#/domains/product/draft-rules"
import { useT } from "#/locales/use-t"
import type { SellerScopedT } from "#/locales/messages.gen"

type SkuT = SellerScopedT<"product">

// 校验失败：提示 + 不提交（与「空=清空」区分，输入不被静默吞掉）；issue 是结构化事实，交给 notify 在弹出边界按当时语言换句，不在这里预翻
function rejectInput(issue: CheckedMessageFact | undefined) {
    if (issue !== undefined) notify.error(issue)
}

function PriceCell({
    value,
    onCommit,
    t,
}: {
    value: Money | null
    onCommit: (price: Money | null) => void
    t: SkuT
}) {
    const [text, setText] = useState<string | undefined>(undefined)
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
                    // Money 是普通对象，重新解析必得新引用：按值比再提交（清空也只在真有值时算一次改动）
                    if (cell.value === null ? value !== null : !sameMoney(cell.value, value))
                        onCommit(cell.value)
                }}
            />
            <InputGroupAddon
                align="inline-end"
                variant="quiet"
            >
                {t("product.sku.unit.yuan")}
            </InputGroupAddon>
        </InputGroup>
    )
}

function QuantityCell({
    value,
    onCommit,
    t,
}: {
    value: number | null
    onCommit: (count: number | null) => void
    t: SkuT
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
                {t("product.sku.unit.piece")}
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
    const t = useT("product")
    const [batchPrice, setBatchPrice] = useState("")
    const [batchStock, setBatchStock] = useState("")
    const [keyword, setKeyword] = useState("")
    const [fullscreen, setFullscreen] = useState(false)

    function update(index: number, patch: Partial<SkuDraftRow>) {
        onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    }

    function remove(index: number) {
        onChange(rows.filter((_, i) => i !== index))
    }

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
        <div
            className={cn(fullscreen && "fixed inset-0 z-overlay overflow-auto bg-background p-6")}
        >
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <InputGroup className="h-9 w-fit">
                    <InputGroupAddon
                        align="inline-start"
                        variant="quiet"
                    >
                        {t("product.sku.batch.priceLabel")}
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
                        {t("product.sku.unit.yuan")}
                    </InputGroupAddon>
                </InputGroup>
                <InputGroup className="h-9 w-fit">
                    <InputGroupAddon
                        align="inline-start"
                        variant="quiet"
                    >
                        {t("product.sku.batch.countLabel")}
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
                        {t("product.sku.unit.piece")}
                    </InputGroupAddon>
                </InputGroup>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyBatch}
                    disabled={!batchPrice.trim() && !batchStock.trim()}
                >
                    {t("product.sku.batch.submit")}
                </Button>

                <div className="ml-auto flex items-center gap-2">
                    <InputGroup className="h-9 w-44">
                        <InputGroupInput
                            placeholder={t("product.sku.search.placeholder")}
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
                                {t("product.sku.fullscreen.exit")}
                            </>
                        ) : (
                            <>
                                <Maximize2 className="size-4" />
                                {t("product.sku.fullscreen.enter")}
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("product.sku.col.spec")}</TableHead>
                        <TableHead className="w-36 required-mark">
                            {t("product.sku.col.price")}
                        </TableHead>
                        <TableHead className="w-32 required-mark">
                            {t("product.sku.col.count")}
                        </TableHead>
                        <TableHead className="w-36">{t("product.sku.col.sellerCode")}</TableHead>
                        <TableHead className="w-28">
                            {t("product.sku.col.skuCategory")}
                            <CircleHelp className="ml-1 inline size-3.5 text-muted-foreground/60" />
                        </TableHead>
                        <TableHead className="w-24">{t("product.sku.col.onShelf")}</TableHead>
                        <TableHead className="w-16">{t("product.sku.col.action")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visible.map(({ row: d, index: i }) => (
                        <TableRow key={d.skuId ?? i}>
                            <TableCell>
                                <span className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {skuDisplayLabel(d.label, t)}
                                    </span>
                                </span>
                            </TableCell>
                            <TableCell>
                                <PriceCell
                                    value={d.price}
                                    onCommit={(price) => update(i, { price })}
                                    t={t}
                                />
                            </TableCell>
                            <TableCell>
                                <QuantityCell
                                    value={d.stock}
                                    onCommit={(stock) => update(i, { stock })}
                                    t={t}
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    placeholder={t("product.sku.sellerCode.placeholder")}
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
                                                value={t("product.sku.skuCategory.placeholder")}
                                            />
                                        }
                                    />
                                    <TooltipContent>
                                        {t("product.sku.skuCategory.tooltip")}
                                    </TooltipContent>
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
                                    aria-label={t("product.sku.onShelf.aria")}
                                ></Switch>
                            </TableCell>
                            <TableCell>
                                <Button
                                    variant="link"
                                    onClick={() => remove(i)}
                                >
                                    {t("product.sku.delete")}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {visible.length === 0 && (
                <Empty className="gap-0 py-6">
                    <EmptyTitle>{t("product.sku.empty.noMatch")}</EmptyTitle>
                </Empty>
            )}
        </div>
    )

    return content
}
