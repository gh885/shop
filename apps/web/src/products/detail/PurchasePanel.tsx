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

import { formatMoney } from "@shop/common"

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
import { PDP_MAX_QUANTITY } from "./constants"

/**
 * 详情页右侧购买区：标题 → 价格 → 服务承诺 → 规格选择 → 数量 → 加购/立即购买（对齐参考图）。
 * 规格选择状态由 route 从 URL 读入并持有（useSkuSelection），本组件纯受控；
 * 数量由 route 持有并已按库存收敛，本组件不再自己截断。
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

            {/* 价格区：共享 Price 走 splitMoney 分段（符号小/元整数大/角分小），符号跟币种 */}
            <div className="flex items-baseline gap-2">
                <Price
                    value={price.primary}
                    className="text-4xl font-bold text-primary"
                />
                {price.rangeTo !== undefined && (
                    <span className="flex items-baseline gap-1 text-primary">
                        -
                        <Price
                            value={price.rangeTo}
                            className="text-lg font-medium"
                        />
                    </span>
                )}
                {price.original !== undefined && (
                    <span className="text-sm text-muted-foreground line-through tabular-nums">
                        {formatMoney(price.original)}
                    </span>
                )}
            </div>

            {/* 服务承诺：无理由退货跟商品自己的声明走（消保法第 25 条把「除外类目」交给卖家勾，
                不支持就得在下单页说明白，而不是不吭声）；发货时效/运费仍是静态占位 */}
            <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                    <Truck className="size-4" />
                    48小时内发货 · 快递免运费
                </p>
                <p className="flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    {detail.sevenDayReturn
                        ? "7天无理由退货"
                        : "本商品不支持七天无理由退货（下单即视为已知悉）"}
                </p>
            </div>

            {/* 规格选择：有 SKU 专属图的维度升级为图片卡，其余文字丸（对齐参考图 分册名/套餐类型） */}
            {detail.specs.map((spec) => {
                const selected = selection[spec.name]
                return isImageSpecGroup(detail.skus, spec) ? (
                    <div key={spec.name}>
                        <p className="mb-2 text-sm text-muted-foreground">{spec.name}</p>
                        <div className="flex flex-wrap gap-2.5">
                            {spec.values.map((sv) => {
                                const value = sv.value
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
                            value={selected === undefined ? [] : [selected]}
                            onValueChange={(v) => {
                                // ToggleGroup 反选（v 为空）时把当前值再传一次：select 的「同值再点 = 取消」
                                // 语义正好接住它 —— 图片规格卡（SpecButton）走的是同一条规则，
                                // 两条渲染路径不能一个能取消、一个取消不了（URL 进了选择态后这种不一致会变成死点击）
                                const next = v[0] ?? selected
                                if (next !== undefined) select(spec.name, next)
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
                    </div>
                )
            })}

            {/* 数量步进：分隔线与上方信息区隔开（对齐参考图） */}
            <Separator />
            <div className="flex items-center gap-3">
                <QuantityStepper
                    quantity={quantity}
                    onChange={onQuantityChange}
                    max={soldOut ? 0 : (matchedSku?.stock ?? undefined)}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
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

/** 数量步进器：max 为选中 SKU 库存；未选全规格时用宽松上界（PDP_MAX_QUANTITY） */
function QuantityStepper({
    quantity,
    onChange,
    max,
}: {
    quantity: number
    onChange: (n: number) => void
    max?: number
}) {
    const upper = max ?? PDP_MAX_QUANTITY

    return (
        <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">数量</p>
            <ButtonGroup>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="减少数量"
                    disabled={quantity <= 1}
                    onClick={() => onChange(Math.max(1, quantity - 1))}
                >
                    <Minus className="size-4" />
                </Button>
                <ButtonGroupText className="w-10 justify-center tabular-nums">
                    {quantity}
                </ButtonGroupText>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="增加数量"
                    disabled={quantity >= upper}
                    onClick={() => onChange(Math.min(upper, quantity + 1))}
                >
                    <Plus className="size-4" />
                </Button>
            </ButtonGroup>
        </div>
    )
}
