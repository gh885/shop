import { useState } from "react"
import {
    Button,
    FieldDescription,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { notify } from "@shop/app-kit/data"

import { useT } from "#/locales/use-t"
import { message } from "#/locales/message"
import { parsePriceCell } from "../../form"
import { emptySku, type CreateDraft, type FieldErrors, type MatrixRow } from "../model"
import type { CreateFieldErrorKey } from "../submit"

type SkuPatch = Partial<ReturnType<typeof emptySku>>

export function SkuMatrix({
    rows,
    draft,
    errors,
    onChange,
    onToggleDisabled,
    onBatchFill,
    overLimit,
}: {
    rows: MatrixRow[]
    draft: CreateDraft
    errors: FieldErrors
    onChange: (key: string, patch: SkuPatch) => void
    onToggleDisabled: (key: string) => void
    onBatchFill: (patch: SkuPatch) => void
    overLimit: boolean
}) {
    const t = useT("product")
    const errorText = (key: string) =>
        key.startsWith("product.") ? t(key as CreateFieldErrorKey) : key
    const [batchPrice, setBatchPrice] = useState("")
    const [batchOriginalPrice, setBatchOriginalPrice] = useState("")
    const [batchWeight, setBatchWeight] = useState("")

    function applyBatch() {
        const patch: SkuPatch = {}
        if (batchPrice.trim() !== "") {
            if (parsePriceCell(batchPrice).value === null) {
                notify.error(message("product.create.error.priceFormat"))
                return
            }
            patch.price = batchPrice.trim()
        }
        if (batchOriginalPrice.trim() !== "") {
            if (parsePriceCell(batchOriginalPrice).value === null) {
                notify.error(message("product.create.error.priceFormat"))
                return
            }
            patch.originalPrice = batchOriginalPrice.trim()
        }
        if (batchWeight.trim() !== "") {
            patch.weightG = batchWeight.trim()
        }
        if (Object.keys(patch).length === 0) return
        onBatchFill(patch)
    }

    return (
        <section
            id="section-skus"
            className="scroll-mt-16 space-y-3 rounded-lg bg-background p-5 shadow-sm"
        >
            <h2 className="text-base font-semibold">{t("product.create.section.skus")}</h2>
            <FieldDescription>{t("product.create.skus.hint")}</FieldDescription>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                    {t("product.create.skus.batchLabel")}
                </span>
                <Input
                    value={batchPrice}
                    inputMode="decimal"
                    placeholder={t("product.create.sku.price")}
                    aria-label={t("product.create.skus.batchPriceAria")}
                    onChange={(event) => setBatchPrice(event.target.value)}
                    className="h-9 w-24 text-right tabular-nums"
                />
                <Input
                    value={batchOriginalPrice}
                    inputMode="decimal"
                    placeholder={t("product.create.sku.originalPrice")}
                    aria-label={t("product.create.skus.batchOriginalPriceAria")}
                    onChange={(event) => setBatchOriginalPrice(event.target.value)}
                    className="h-9 w-24 text-right tabular-nums"
                />
                <Input
                    value={batchWeight}
                    inputMode="numeric"
                    placeholder={t("product.create.sku.weight")}
                    aria-label={t("product.create.skus.batchWeightAria")}
                    onChange={(event) => setBatchWeight(event.target.value.replaceAll(/\D/g, ""))}
                    className="h-9 w-24 text-right tabular-nums"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyBatch}
                    disabled={
                        batchPrice.trim() === "" &&
                        batchOriginalPrice.trim() === "" &&
                        batchWeight.trim() === ""
                    }
                >
                    {t("product.create.skus.batchApply")}
                </Button>
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("product.create.sku.spec")}</TableHead>
                            <TableHead className="w-32 required-mark">
                                {t("product.create.sku.price")}
                            </TableHead>
                            <TableHead className="w-32">
                                {t("product.create.sku.originalPrice")}
                            </TableHead>
                            <TableHead className="w-24">{t("product.create.sku.weight")}</TableHead>
                            <TableHead className="w-40">
                                {t("product.create.sku.barcode")}
                            </TableHead>
                            <TableHead className="w-40">
                                {t("product.create.sku.merchantCode")}
                            </TableHead>
                            <TableHead className="w-20">{t("product.create.sku.onSale")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const sku = draft.skus[row.key] ?? emptySku()
                            const disabled = draft.disabledKeys.includes(row.key)
                            const priceError = errors[`sku:${row.key}:price`]
                            const originalError = errors[`sku:${row.key}:originalPrice`]
                            return (
                                <TableRow key={row.key}>
                                    <TableCell>{row.label}</TableCell>
                                    <TableCell>
                                        <Input
                                            value={sku.price}
                                            inputMode="decimal"
                                            disabled={disabled}
                                            placeholder="0.00"
                                            aria-label={t("product.create.sku.priceAria", {
                                                label: row.label,
                                            })}
                                            onChange={(event) =>
                                                onChange(row.key, { price: event.target.value })
                                            }
                                            className="w-24 text-right tabular-nums"
                                        />
                                        {priceError && !disabled ? (
                                            <p className="mt-1 text-xs text-destructive">
                                                {errorText(priceError)}
                                            </p>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={sku.originalPrice}
                                            inputMode="decimal"
                                            disabled={disabled}
                                            placeholder="0.00"
                                            aria-label={t("product.create.sku.originalPriceAria", {
                                                label: row.label,
                                            })}
                                            onChange={(event) =>
                                                onChange(row.key, {
                                                    originalPrice: event.target.value,
                                                })
                                            }
                                            className="w-24 text-right tabular-nums"
                                        />
                                        {originalError && !disabled ? (
                                            <p className="mt-1 text-xs text-destructive">
                                                {errorText(originalError)}
                                            </p>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={sku.weightG}
                                            inputMode="numeric"
                                            disabled={disabled}
                                            placeholder="0"
                                            aria-label={t("product.create.sku.weightAria", {
                                                label: row.label,
                                            })}
                                            onChange={(event) =>
                                                onChange(row.key, {
                                                    weightG: event.target.value.replaceAll(
                                                        /\D/g,
                                                        "",
                                                    ),
                                                })
                                            }
                                            className="w-20 text-right tabular-nums"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={sku.barcode}
                                            maxLength={64}
                                            disabled={disabled}
                                            aria-label={t("product.create.sku.barcodeAria", {
                                                label: row.label,
                                            })}
                                            onChange={(event) =>
                                                onChange(row.key, { barcode: event.target.value })
                                            }
                                            className="tabular-nums"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={sku.merchantCode}
                                            maxLength={64}
                                            disabled={disabled}
                                            aria-label={t("product.create.sku.merchantCodeAria", {
                                                label: row.label,
                                            })}
                                            onChange={(event) =>
                                                onChange(row.key, {
                                                    merchantCode: event.target.value,
                                                })
                                            }
                                            className="tabular-nums"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            checked={!disabled}
                                            aria-label={t("product.create.sku.onSaleAria", {
                                                label: row.label,
                                            })}
                                            onChange={() => onToggleDisabled(row.key)}
                                            className="size-4 accent-primary"
                                        />
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
            {errors["skus"] || overLimit ? (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {errors["skus"]
                        ? errorText(errors["skus"])
                        : t("product.create.error.skuLimit")}
                </p>
            ) : null}
        </section>
    )
}
