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
import { derivePriceStock } from "#/product/draft-model"
import type { ListingTime, SkuDraftRow, SpecSelection } from "#/product/draft-model"
import { categorySpecTemplateOptions } from "#/product/queries"

import { SalesAttrsEditor } from "./SalesAttrsEditor"
import { SkuGridEditor } from "./SkuGridEditor"

/**
 * 发布页「销售信息」块（section-sales）：①销售属性 ②销售规格 ③一口价 ④总库存。
 *
 * 完全受控：selections/skuRows 由外层(use-product-draft)持有，本组件只做模板加载(自身副作用) + 展示转发。
 * 选值变化 → onSelectionsChange 上抛（级联生成 SKU 交给外层 hook）；SKU 行编辑 → onSkuRowsChange 上抛。
 *
 * 一口价/总库存为商品级派生展示（不做输入）：
 *  - 一口价 = 当前全部 SKU 价格区间（单 SKU 同价只显一个价），随 SKU 编辑实时联动（对齐淘宝"有效 SKU 价格区间"）
 *  - 总库存 = 全部 SKU 库存之和，纯展示不可填
 *
 * 三态：模板加载中 → Skeleton；失败 → StateError(带重试)；无销售属性 → 属性块给 Empty 提示，
 * 但一口价/总库存仍展示（单规格商品也有一口价/库存，与"是否有规格属性"无关）。
 */
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
    /** 上架商品规格冻结：禁用销售属性编辑器（价格/库存仍可改，改规格需先下架） */
    specsLocked?: boolean
    /** 仓库中/上架编辑提交=只保存不回退状态，隐藏「上架时间」选择（避免误导发布） */
    listingTimeEditable?: boolean
    onSelectionsChange: (selections: SpecSelection[]) => void
    onSkuRowsChange: (rows: SkuDraftRow[]) => void
    onListingTimeChange: (next: ListingTime) => void
}) {
    // 区块内聚的取数：失败就地渲染 + 官方 manual 重试（`refetch`），不拖垮整张发布表单
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

                {/* 一口价/总库存是只读派生汇总，与上方编辑区用分隔线区隔 */}
                <div className="space-y-3 border-t border-border pt-5">
                    <PriceStockFields skuRows={skuRows} />
                </div>

                {/* 上架时间：决定「提交商品信息」落哪个状态。定时上架本轮不做。 */}
                <ListingTimeField
                    listingTime={listingTime}
                    editable={listingTimeEditable}
                    onChange={onListingTimeChange}
                />
            </CardContent>
        </Card>
    )
}

/**
 * 上架时间（立即上架 / 放入仓库）。
 *
 * 抽出来是为了让 SalesInfoSection 的分支密度降下来：它自带「编辑期只读」那一支与
 * 选中值的白名单判断，两块都从主组件挪走后主组件只剩取数门控与两处结构判断
 * （健康扫描按「cc>=5 且零覆盖必上榜」判）。
 */
function ListingTimeField({
    listingTime,
    editable,
    onChange,
}: {
    listingTime: ListingTime
    /** 仓库中/上架编辑提交=只保存不回退状态，隐藏「上架时间」选择（避免误导发布） */
    editable?: boolean
    onChange: (next: ListingTime) => void
}) {
    const t = useT("product")
    // 仅新建/草稿编辑有意义；仓库中/上架编辑时提交只保存、不回退状态（上架/入库在列表操作）
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

/**
 * 销售属性区块：类目模板为空时给一句说明（非空则渲染编辑器）。
 * 抽出来是为了让 SalesInfoSection 主函数的分支密度降下来（健康扫描按
 * 「cc>=5 且零覆盖必上榜」判，cc 5 → CRAP 30 仍然越线）。
 */
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

/** 一口价（价格区间）+ 总库存（库存之和）：纯派生展示，随 SKU 编辑实时联动 */
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
