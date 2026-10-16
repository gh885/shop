import { Minus, Plus, ShieldCheck, Truck } from "lucide-react"

import {
    Button,
    ButtonGroup,
    ButtonGroupText,
    Image,
    Separator,
    ToggleGroup,
    ToggleGroupItem,
    cn,
} from "@shop/ui-web"

import { useI18n } from "@shop/app-kit/i18n"
import { formatMoney } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"
import type { ProductDetail } from "../product"
import {
    derivePriceView,
    deriveStockText,
    findMatchingSku,
    isImageSpecGroup,
    isSelectionComplete,
    specValueImage,
    type SkuSelection,
} from "../product"
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
    const soldOut = complete && (matchedSku?.stock ?? 0) <= 0
    const stock = deriveStockText(detail, selection)

    return (
        <div className="flex flex-col gap-5">
            <TitleBlock detail={detail} />
            <PriceBlock
                detail={detail}
                selection={selection}
            />
            <ServicePromises sevenDayReturn={detail.sevenDayReturn} />

            {detail.specs.map((spec) => (
                <SpecPicker
                    key={spec.name}
                    spec={spec}
                    detail={detail}
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
                    max={soldOut ? 0 : (matchedSku?.stock ?? undefined)}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
                    {stock.key === "product.stock.inStock"
                        ? t(stock.key, { stock: stock.stock })
                        : t(stock.key)}
                </span>
            </div>
        </div>
    )
}

function TitleBlock({ detail }: { detail: ProductDetail }) {
    return (
        <>
            <h1 className="text-xl font-bold leading-snug text-foreground">
                {detail.product.title}
            </h1>
            {detail.product.subtitle && (
                <p className="-mt-3 text-sm text-muted-foreground">{detail.product.subtitle}</p>
            )}
        </>
    )
}

function PriceBlock({ detail, selection }: { detail: ProductDetail; selection: SkuSelection }) {
    const { locale } = useI18n()
    const price = derivePriceView(detail, selection)
    return (
        <div className="flex items-baseline gap-2">
            <Price
                value={price.primary}
                className="text-4xl font-bold text-primary-subtle-foreground"
            />
            {price.rangeTo !== undefined && (
                <span className="flex items-baseline gap-1 text-primary-subtle-foreground">
                    -
                    <Price
                        value={price.rangeTo}
                        className="text-lg font-medium"
                    />
                </span>
            )}
            {price.original !== undefined && (
                <span className="text-sm text-muted-foreground line-through tabular-nums">
                    {formatMoney(price.original, locale)}
                </span>
            )}
        </div>
    )
}

function ServicePromises({ sevenDayReturn }: { sevenDayReturn: boolean }) {
    const t = useT("product")
    return (
        <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
                <Truck className="size-4" />
                {t("product.detail.promise.shipping")}
            </p>
            <p className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                {sevenDayReturn
                    ? t("product.detail.promise.return7d")
                    : t("product.detail.promise.noReturn7d")}
            </p>
        </div>
    )
}

function SpecPicker({
    spec,
    detail,
    selection,
    select,
    isAvailable,
}: {
    spec: ProductDetail["specs"][number]
    detail: ProductDetail
    selection: SkuSelection
    select: (specName: string, value: string) => void
    isAvailable: (specName: string, value: string) => boolean
}) {
    const selected = selection[spec.name]
    return (
        <div>
            <p className="mb-2 text-sm text-muted-foreground">{spec.name}</p>
            {isImageSpecGroup(detail.skus, spec) ? (
                <ImageSpecValues
                    spec={spec}
                    detail={detail}
                    selection={selection}
                    onSelect={select}
                    isAvailable={isAvailable}
                />
            ) : (
                <TextSpecValues
                    spec={spec}
                    selected={selected}
                    onSelect={select}
                    isAvailable={isAvailable}
                />
            )}
        </div>
    )
}

function ImageSpecValues({
    spec,
    detail,
    selection,
    onSelect,
    isAvailable,
}: {
    spec: ProductDetail["specs"][number]
    detail: ProductDetail
    selection: SkuSelection
    onSelect: (specName: string, value: string) => void
    isAvailable: (specName: string, value: string) => boolean
}) {
    return (
        <div className="flex flex-wrap gap-2.5">
            {spec.values.map((sv) => {
                const value = sv.value
                return (
                    <SpecButton
                        key={value}
                        value={value}
                        selected={selection[spec.name] === value}
                        available={isAvailable(spec.name, value)}
                        onSelect={() => onSelect(spec.name, value)}
                        image={specValueImage(detail.skus, spec.name, value)}
                    />
                )
            })}
        </div>
    )
}

function TextSpecValues({
    spec,
    selected,
    onSelect,
    isAvailable,
}: {
    spec: ProductDetail["specs"][number]
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
            {spec.values.map((sv) => {
                const value = sv.value
                return (
                    <ToggleGroupItem
                        key={value}
                        value={value}
                        disabled={!isAvailable(spec.name, value)}
                    >
                        {value}
                    </ToggleGroupItem>
                )
            })}
        </ToggleGroup>
    )
}

function SpecButton({
    value,
    image,
    selected,
    available,
    onSelect,
}: {
    value: string
    image?: string
    selected: boolean
    available: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            disabled={!available}
            onClick={onSelect}
            aria-pressed={selected}
            className={cn(
                "w-24 overflow-hidden rounded-lg border-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                selected ? "border-primary" : "border-border",
            )}
        >
            <Image
                src={image}
                alt={value}
                ratio={3 / 2}
                className="w-full"
            />
            <span
                title={value}
                className="block truncate px-1.5 py-1 text-xs text-foreground"
            >
                {value}
            </span>
        </button>
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
