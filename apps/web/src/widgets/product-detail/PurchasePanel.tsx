import { Minus, Plus, ShieldCheck, Truck } from "lucide-react"

import { Separator, ToggleGroup, ToggleGroupItem } from "@shop/ui-web"

import type { ProductDetail } from "#/product"
import {
    derivePriceView,
    deriveStockText,
    findMatchingSku,
    isImageSpecGroup,
    isSelectionComplete,
    specValueImage,
    type SkuSelection,
} from "#/product"

/**
 * 详情页右侧购买区：标题 → 价格 → 服务承诺 → 规格选择 → 数量 → 加购/立即购买（对齐参考图）。
 * 规格选择状态由 route 的 useSkuSelection 持有，本组件纯受控；数量为局部状态。
 */
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
    const price = derivePriceView(detail, selection)
    const complete = isSelectionComplete(detail, selection)
    const matchedSku = findMatchingSku(detail.skus, selection)
    /** 选全规格后才有「售罄」概念：命中 SKU 无库存 */
    const soldOut = complete && (matchedSku?.stock ?? 0) <= 0

    return (
        <div className="flex flex-col gap-5">
            {/* 标题 + 副标题 */}
            <h1 className="text-xl font-bold leading-snug text-foreground">
                {detail.product.title}
            </h1>
            {detail.product.subtitle && (
                <p className="-mt-3 text-sm text-muted-foreground">{detail.product.subtitle}</p>
            )}

            {/* 价格区 */}
            <div className="flex items-baseline gap-2">
                <span className="text-primary">
                    <span className="text-lg">¥</span>
                    <span className="text-4xl font-bold tracking-tight">{price.primary}</span>
                </span>
                {price.rangeTo && (
                    <span className="text-lg font-medium text-primary">- {price.rangeTo}</span>
                )}
                {price.original && (
                    <span className="text-sm text-muted-foreground line-through">
                        ¥{price.original}
                    </span>
                )}
            </div>

            {/* 服务承诺：静态占位，后续接店铺服务配置（发货时效/运费模板） */}
            <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                    <Truck className="size-4" />
                    48小时内发货 · 快递免运费
                </p>
                <p className="flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    7天无理由退货
                </p>
            </div>

            {/* 规格选择：有 SKU 专属图的维度升级为图片卡，其余文字丸（对齐参考图 分册名/套餐类型） */}
            {detail.specs.map((spec) =>
                isImageSpecGroup(detail.skus, spec) ? (
                    <div key={spec.name}>
                        <p className="mb-2 text-sm text-muted-foreground">{spec.name}</p>
                        <div className="flex flex-wrap gap-2.5">
                            {spec.values.map((value) => {
                                const image = specValueImage(detail.skus, spec.name, value)
                                return (
                                    <SpecButton
                                        key={value}
                                        value={value}
                                        selected={selection[spec.name] === value}
                                        available={isAvailable(spec.name, value)}
                                        onSelect={() => select(spec.name, value)}
                                        image={image}
                                    />
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div key={spec.name}>
                        <p className="mb-2 text-sm text-muted-foreground">{spec.name}</p>
                        <ToggleGroup
                            value={selection[spec.name] ? [selection[spec.name]] : []}
                            onValueChange={(v) => {
                                // 不允许反选为空：SKU 规格必须选中一个值
                                if (v[0] !== undefined) select(spec.name, v[0])
                            }}
                            variant="outline"
                            className="flex-wrap"
                        >
                            {spec.values.map((value) => (
                                <ToggleGroupItem
                                    key={value}
                                    value={value}
                                    disabled={!isAvailable(spec.name, value)}
                                    className="text-foreground aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
                                >
                                    {value}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </div>
                ),
            )}

            {/* 数量步进：分隔线与上方信息区隔开（对齐参考图） */}
            <Separator />
            <div className="flex items-center gap-3">
                <QuantityStepper
                    quantity={quantity}
                    onChange={onQuantityChange}
                    max={soldOut ? 0 : (matchedSku?.stock ?? undefined)}
                />
                <span className="text-sm text-muted-foreground">
                    {deriveStockText(detail, selection)}
                </span>
            </div>
        </div>
    )
}

/** 图片规格卡：传 SKU 专属图的维度用图 + 值卡片（一次性异形件，Toggle 语义但样式定制，不走 ToggleGroupItem） */
function SpecButton({
    value,
    image,
    selected,
    available,
    onSelect,
}: {
    value: string
    image: string | undefined
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
            className={`w-24 overflow-hidden rounded-lg border-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? "border-primary" : "border-border"
            }`}
        >
            <img
                src={image}
                alt={value}
                className="h-16 w-full object-cover"
            />
            <span className="block truncate px-1.5 py-1 text-xs text-foreground">{value}</span>
        </button>
    )
}

/** 数量步进器：max 为选中 SKU 库存；undefined 表示规格未选全（给宽松上限） */
function QuantityStepper({
    quantity,
    onChange,
    max,
}: {
    quantity: number
    onChange: (n: number) => void
    max: number | undefined
}) {
    const upper = max ?? 99

    return (
        <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">数量</p>
            <div className="flex h-9 items-center overflow-hidden rounded-lg border border-border">
                <button
                    type="button"
                    aria-label="减少数量"
                    disabled={quantity <= 1}
                    onClick={() => onChange(Math.max(1, quantity - 1))}
                    className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
                >
                    <Minus className="size-4" />
                </button>
                <span className="w-10 border-x border-border text-center text-sm tabular-nums">
                    {quantity}
                </span>
                <button
                    type="button"
                    aria-label="增加数量"
                    disabled={quantity >= upper}
                    onClick={() => onChange(Math.min(upper, quantity + 1))}
                    className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
                >
                    <Plus className="size-4" />
                </button>
            </div>
        </div>
    )
}
