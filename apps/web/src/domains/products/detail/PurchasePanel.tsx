import { Minus, Plus } from "lucide-react"

import {
    Button,
    ButtonGroup,
    ButtonGroupText,
    Separator,
    ToggleGroup,
    ToggleGroupItem,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"
import type { ProductDetail } from "../rules"
import {
    derivePriceView,
    deriveStockText,
    findMatchingSku,
    isSelectionComplete,
    type SkuSelection,
} from "../rules"
import { QUANTITY_FLOOR, quantityUpperBound, stepPurchaseQuantity } from "./purchase-quantity"

export function PurchasePanel({
    detail,
    selection,
    select,
    isAvailable,
    quantity,
    onQuantityChange,
}: {
    detail: ProductDetail
    selection: SkuSelection
    select: (specName: string, value: string) => void
    isAvailable: (specName: string, value: string) => boolean
    quantity: number
    onQuantityChange: (n: number) => void
}) {
    const t = useT("product")
    const complete = isSelectionComplete(detail, selection)
    const matchedSku = findMatchingSku(detail.skus, selection)
    const soldOut = complete && (matchedSku?.availableToPromise ?? 0) <= 0
    const stock = deriveStockText(detail, selection)

    return (
        <div className="flex flex-col gap-5">
            <TitleBlock detail={detail} />
            <PriceBlock
                detail={detail}
                selection={selection}
            />

            {detail.specGroups.map((spec) => (
                <SpecPicker
                    key={spec.name}
                    spec={spec}
                    selection={selection}
                    select={select}
                    isAvailable={isAvailable}
                />
            ))}

            <Separator />
            <div className="flex items-center gap-3">
                <QuantityStepper
                    quantity={quantity}
                    onChange={onQuantityChange}
                    max={soldOut ? 0 : (matchedSku?.availableToPromise ?? undefined)}
                />
                <span className="text-sm text-muted-foreground tabular-nums">{t(stock.key)}</span>
            </div>
        </div>
    )
}

function TitleBlock({ detail }: { detail: ProductDetail }) {
    return <h1 className="text-xl font-bold leading-snug text-foreground">{detail.title}</h1>
}

function PriceBlock({ detail, selection }: { detail: ProductDetail; selection: SkuSelection }) {
    const price = derivePriceView(detail, selection)
    return (
        <div className="flex items-baseline gap-2">
            <Price
                value={price.primary}
                className="text-4xl font-bold text-primary-subtle-foreground"
            />
        </div>
    )
}

function SpecPicker({
    spec,
    selection,
    select,
    isAvailable,
}: {
    spec: ProductDetail["specGroups"][number]
    selection: SkuSelection
    select: (specName: string, value: string) => void
    isAvailable: (specName: string, value: string) => boolean
}) {
    const selected = selection[spec.name]
    return (
        <div>
            <p className="mb-2 text-sm text-muted-foreground">{spec.name}</p>
            <TextSpecValues
                spec={spec}
                selected={selected}
                onSelect={select}
                isAvailable={isAvailable}
            />
        </div>
    )
}

function TextSpecValues({
    spec,
    selected,
    onSelect,
    isAvailable,
}: {
    spec: ProductDetail["specGroups"][number]
    selected: string | undefined
    onSelect: (specName: string, value: string) => void
    isAvailable: (specName: string, value: string) => boolean
}) {
    return (
        <ToggleGroup
            value={selected === undefined ? [] : [selected]}
            onValueChange={(v) => {
                // ToggleGroup 反选（v 为空）时把当前值再传一次：select 的「同值再点 = 取消」
                // 语义正好接住它 —— 图片规格卡（SpecButton）走的是同一条规则，
                // 两条渲染路径不能一个能取消、一个取消不了（URL 进了选择态后这种不一致会变成死点击）
                const next = v[0] ?? selected
                if (next !== undefined) onSelect(spec.name, next)
            }}
            variant="outline"
            className="flex-wrap"
        >
            {spec.values.map((value) => (
                <ToggleGroupItem
                    key={value}
                    value={value}
                    disabled={!isAvailable(spec.name, value)}
                >
                    {value}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    )
}

function QuantityStepper({
    quantity,
    onChange,
    max,
}: {
    quantity: number
    onChange: (n: number) => void
    max?: number
}) {
    const t = useT("product")
    const upper = quantityUpperBound(max)

    return (
        <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{t("product.detail.qty.label")}</p>
            <ButtonGroup>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("product.detail.qty.decrease")}
                    disabled={quantity <= QUANTITY_FLOOR}
                    onClick={() => onChange(stepPurchaseQuantity(quantity, -1, max))}
                >
                    <Minus className="size-4" />
                </Button>
                <ButtonGroupText className="w-10 justify-center tabular-nums">
                    {quantity}
                </ButtonGroupText>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("product.detail.qty.increase")}
                    disabled={quantity >= upper}
                    onClick={() => onChange(stepPurchaseQuantity(quantity, 1, max))}
                >
                    <Plus className="size-4" />
                </Button>
            </ButtonGroup>
        </div>
    )
}
