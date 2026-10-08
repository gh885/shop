import { localeLabel } from "@shop/common/i18n"
import { useI18n, useT } from "./use-i18n"

export interface LocaleSwitcherProps {
    className?: string
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
    const { availableLocales, locale, setLocale } = useI18n()
    // 文案走 app-kit 自己的 catalog（`locale.switch`）：共享组件不依赖宿主 app 的 key，
    // 于是这里用的是类型化的 `useT` 而不是 `useI18n().t`——生产代码里不再有宽形状的 t。
    const t = useT()

    return (
        <select
            aria-label={t("locale.switch")}
            className={
                className ??
                "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            }
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
        >
            {availableLocales.map((item) => (
                <option
                    key={item}
                    value={item}
                >
                    {localeLabel(item)}
                </option>
            ))}
        </select>
    )
}
