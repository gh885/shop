import { type Money, splitMoney } from "@shop/common/domain"
import { useI18n } from "@shop/app-kit/i18n"
import { cn } from "@shop/ui-web"

/**
 * 入参是 Money 而非裸分——符号由币种决定，调用点不必再各自把 `.amount` 抠出来（抠出来那一刻币种就丢了）。
 */
export function Price({ value, className }: { value: Money; className?: string }) {
    const { locale } = useI18n()
    const { symbol, yuan, cents } = splitMoney(value, locale)
    return (
        <span className={cn("inline-flex items-baseline tabular-nums leading-none", className)}>
            <span className="price-mark">{symbol}</span>
            <span className="tracking-tight">{yuan}</span>
            <span className="price-cents">.{cents}</span>
        </span>
    )
}
