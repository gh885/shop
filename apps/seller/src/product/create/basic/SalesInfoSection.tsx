import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Field,
    RadioGroup,
    RadioGroupItem,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { priceRangeText } from "@shop/common"

import type { ListingTime, SkuDraftRow, SpecSelection } from "#/product/draft-model"
import { useCategorySpecTemplate } from "#/product/queries"

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
    const { template, error: loadError, retry } = useCategorySpecTemplate(categoryId)

    // 加载中（首次）：Skeleton；失败：StateError（重试重新拉取）
    if (loadError && !template) {
        return (
            <StateError
                message={loadError}
                onRetry={retry}
            />
        )
    }
    if (!template) {
        return <Skeleton className="h-40 w-full" />
    }

    const hasSpecs = template.length > 0

    return (
        <Card
            id="section-sales"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">02</span>
                    销售信息
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {hasSpecs ? (
                    <Field
                        label="销售属性"
                        layout="horizontal"
                        hint="规范配置销售属性有助于商品转化"
                    >
                        <SalesAttrsEditor
                            attrs={template}
                            value={selections}
                            disabled={specsLocked}
                            onChange={onSelectionsChange}
                            uploadImage={fileUpload}
                        />
                    </Field>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        该类目没有可配置的销售属性，SKU 保持单规格。
                    </p>
                )}

                {skuRows.length > 0 && (
                    <Field
                        label="销售规格"
                        layout="horizontal"
                        required
                    >
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

                {/* 上架时间：决定「提交商品信息」落哪个状态。定时上架本轮不做。
                    仅新建/草稿编辑有意义；仓库中/上架编辑时提交只保存、不回退状态（上架/入库在列表操作）。 */}
                {listingTimeEditable === false ? (
                    <p className="text-sm text-muted-foreground">
                        商品已在上架/仓库状态：此处修改只保存变更、不回退状态；上架、入库请到商品列表操作。
                    </p>
                ) : (
                    <Field
                        label="上架时间"
                        layout="horizontal"
                        required
                    >
                        <RadioGroup
                            className="flex items-center gap-8"
                            value={listingTime}
                            onValueChange={(next) => {
                                if (next === "now" || next === "warehouse") {
                                    onListingTimeChange(next)
                                }
                            }}
                        >
                            <label
                                className="flex items-center gap-2 text-sm"
                                htmlFor="rt-now"
                            >
                                <RadioGroupItem
                                    value="now"
                                    id="rt-now"
                                />
                                立即上架
                            </label>
                            <label
                                className="flex items-center gap-2 text-sm"
                                htmlFor="rt-warehouse"
                            >
                                <RadioGroupItem
                                    value="warehouse"
                                    id="rt-warehouse"
                                />
                                放入仓库
                            </label>
                        </RadioGroup>
                    </Field>
                )}
            </CardContent>
        </Card>
    )
}

/** 一口价（价格区间）+ 总库存（库存之和）：纯派生展示，随 SKU 编辑实时联动 */
function PriceStockFields({ skuRows }: { skuRows: SkuDraftRow[] }) {
    const prices = skuRows.map((r) => r.price).filter((n): n is number => n !== null)
    const min = prices.length > 0 ? Math.min(...prices) : undefined
    const max = prices.length > 0 ? Math.max(...prices) : undefined
    // 展示侧兜底：null（未填）的库存按 0 计入合计（与 wire 投影落库的 ?? 0 一致）
    const totalStock = skuRows.reduce((sum, r) => sum + (r.stock ?? 0), 0)

    return (
        <>
            <Field
                label="一口价"
                layout="horizontal"
                hint="由全部 SKU 价格区间推导；单规格同价只显示一个价"
            >
                <p className="pt-2 text-sm text-foreground tabular-nums">
                    {priceRangeText(min, max)}
                </p>
            </Field>
            <Field
                label="总库存"
                layout="horizontal"
                hint="全部 SKU 库存之和，销售属性/规格变更后自动重算"
            >
                <p className="pt-2 text-sm text-foreground tabular-nums">{totalStock} 件</p>
            </Field>
        </>
    )
}
