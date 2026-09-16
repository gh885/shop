import { splitFen } from "@shop/common"
import { cn } from "@shop/ui-web"

/**
 * 价格分段排版（DESIGN.md §4）：¥ 小 / 元整数大 / 角分小。
 * 组件只定比例（em 相对值），字号由调用方经 className 给基础档：
 * 主价锚点 text-4xl / 商品卡 text-2xl / 行内明细 text-sm。
 * tabular-nums 内置：SKU 切换、数量增减时数字不抖宽。
 */
export function Price({ value, className }: { value: number; className?: string }) {
    const { yuan, cents } = splitFen(value)
    return (
        <span className={cn("inline-flex items-baseline tabular-nums leading-none", className)}>
            <span className="price-mark">¥</span>
            <span className="tracking-tight">{yuan}</span>
            <span className="price-cents">.{cents}</span>
        </span>
    )
}
