import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Field,
    FieldDescription,
    FieldLabel,
    Label,
    RadioGroup,
    RadioGroupItem,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { priceRangeText } from "@shop/common/domain"
import { toApiError } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { useQuery } from "@tanstack/react-query"
import type { CategoryAttrNodeResponse } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { derivePriceStock } from "#/product/draft-rules"
import type { ListingTime, SkuDraftRow, SpecSelection } from "#/product/draft-rules"
import { categorySpecTemplateOptions } from "#/product/queries"

import { SalesAttrsEditor } from "./SalesAttrsEditor"
import { SkuGridEditor } from "./SkuGridEditor"

export function SalesInfoSection({
    fileUpload,
    categoryId,
    selections,
    skuRows,
    listingTime,
    specsLocked,
    listingTimeEditable,
    onSelectionsChange,
    onSkuRowsChange,
    onListingTimeChange,
}: {
    fileUpload: (file: File) => Promise<string>
    categoryId: string
    selections: SpecSelection[]
    skuRows: SkuDraftRow[]
    listingTime: ListingTime
    specsLocked?: boolean
    listingTimeEditable?: boolean
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    onListingTimeChange: (next: ListingTime) => void
}) {
    const { locale } = useI18n()
    const t = useT()
    const templateQuery = useQuery(categorySpecTemplateOptions(categoryId))

    if (templateQuery.isError) {
        return (
            <StateError
                message={errorText(
                    toApiError(templateQuery.error),
                    locale,
                    t("common.loadFailed.specTemplate"),
                )}
                onRetry={() => void templateQuery.refetch()}
                retrying={templateQuery.isFetching}
            />
        )
    }
    if (!templateQuery.data) {
        return <Skeleton className="h-40 w-full" />
    }
    const template = templateQuery.data

    return (
        <Card
            id="section-sales"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">02</span>
                    {t("product.sales.title")}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <SpecsField
                    template={template}
                    selections={selections}
                    specsLocked={specsLocked}
                    onSelectionsChange={onSelectionsChange}
                    fileUpload={fileUpload}
                />

                {skuRows.length > 0 && (
                    <Field orientation="horizontal">
                        <FieldLabel required>{t("product.sales.grid.label")}</FieldLabel>
                        <SkuGridEditor
                            rows={skuRows}
                            onChange={onSkuRowsChange}
                        />
                    </Field>
                )}

                <div className="space-y-3 border-t border-border pt-5">
                    <PriceStockFields skuRows={skuRows} />
                </div>

                <ListingTimeField
                    listingTime={listingTime}
                    editable={listingTimeEditable}
                    onChange={onListingTimeChange}
                />
            </CardContent>
        </Card>
    )
}

function ListingTimeField({
    listingTime,
    editable,
    onChange,
}: {
    listingTime: ListingTime
    editable?: boolean
    onChange: (next: ListingTime) => void
}) {
    const t = useT("product")
    // 仅新建/草稿会话有发布目标；仓库中/上架编辑提交只保存不回退状态，隐藏选择避免误导发布
    if (editable === false) {
        return (
            <p className="text-sm text-muted-foreground">
                {t("product.sales.listingTime.lockedNotice")}
            </p>
        )
    }
    return (
        <Field orientation="horizontal">
            <FieldLabel required>{t("product.sales.listingTime.label")}</FieldLabel>
            <RadioGroup
                className="flex items-center gap-8"
                value={listingTime}
                onValueChange={(next) => {
                    if (next === "now" || next === "warehouse") {
                        onChange(next)
                    }
                }}
            >
                <Label htmlFor="rt-now">
                    <RadioGroupItem
                        value="now"
                        id="rt-now"
                    />
                    {t("product.sales.listingTime.now")}
                </Label>
                <Label htmlFor="rt-warehouse">
                    <RadioGroupItem
                        value="warehouse"
                        id="rt-warehouse"
                    />
                    {t("product.sales.listingTime.warehouse")}
                </Label>
            </RadioGroup>
        </Field>
    )
}

function SpecsField({
    template,
    selections,
    specsLocked,
    onSelectionsChange,
    fileUpload,
}: {
    template: CategoryAttrNodeResponse[]
    selections: SpecSelection[]
    specsLocked?: boolean
    onSelectionsChange: (selections: SpecSelection[]) => void
    fileUpload: (file: File) => Promise<string>
}) {
    const t = useT("product")
    if (template.length === 0) {
        return <p className="text-sm text-muted-foreground">{t("product.sales.specs.noAttr")}</p>
    }
    return (
        <Field orientation="horizontal">
            <FieldLabel>{t("product.sales.specs.label")}</FieldLabel>
            <SalesAttrsEditor
                attrs={template}
                value={selections}
                disabled={specsLocked}
                onChange={onSelectionsChange}
                uploadImage={fileUpload}
            />
            <FieldDescription>{t("product.sales.specs.desc")}</FieldDescription>
        </Field>
    )
}

function PriceStockFields({ skuRows }: { skuRows: SkuDraftRow[] }) {
    const { locale } = useI18n()
    const t = useT()
    const { min, max, totalStock } = derivePriceStock(skuRows)

    return (
        <>
            <Field orientation="horizontal">
                <FieldLabel>{t("product.sales.price.label")}</FieldLabel>
                <p className="pt-2 text-sm text-foreground tabular-nums">
                    {priceRangeText(min, max, locale) ?? t("common.unpriced")}
                </p>
                <FieldDescription>{t("product.sales.price.desc")}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
                <FieldLabel>{t("product.sales.stock.label")}</FieldLabel>
                <p className="pt-2 text-sm text-foreground tabular-nums">
                    {t("product.sales.stock.count", { count: totalStock })}
                </p>
                <FieldDescription>{t("product.sales.stock.desc")}</FieldDescription>
            </Field>
        </>
    )
}
