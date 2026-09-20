import { type Money, splitMoney } from "@shop/common"
import { cn } from "@shop/ui-web"

/**
 * 价格分段排版（DESIGN.md §4）：币种符号小 / 元整数大 / 角分小。入参是 Money 而非裸分——
 * 符号由币种决定，调用点不必再各自把 `.amount` 抠出来（抠出来那一刻币种就丢了）。
 * 组件只定比例（em 相对值），字号由调用方经 className 给基础档：
 * 主价锚点 text-4xl / 商品卡 text-2xl / 行内明细 text-sm。
 * tabular-nums 内置：SKU 切换、数量增减时数字不抖宽。
 */
export function Price({ value, className }: { value: Money; className?: string }) {
    const { symbol, yuan, cents } = splitMoney(value)
    return (
        <span className={cn("inline-flex items-baseline tabular-nums leading-none", className)}>
            <span className="price-mark">{symbol}</span>
            <span className="tracking-tight">{yuan}</span>
            <span className="price-cents">.{cents}</span>
        </span>
    )
}
