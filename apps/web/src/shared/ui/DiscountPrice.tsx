import type { Money } from "@shop/common/domain"
import { Price } from "./Price"

/**
 * 负号是文字而不是颜色：优惠是减项这件事必须写出来，只靠红色/灰色表达正负，
 * 色弱用户与读屏用户都读不到。调用方只在优惠 > 0 时渲染这一行。
 */
export function DiscountPrice({ value, className }: { value: Money; className?: string }) {
    return (
        <span className="inline-flex items-baseline">
            <span>-</span>
            <Price
                value={value}
                className={className}
            />
        </span>
    )
}
