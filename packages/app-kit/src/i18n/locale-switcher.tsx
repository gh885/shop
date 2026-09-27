import { LOCALE_LABELS } from "./messages"
import { useI18n } from "./use-i18n"

export interface LocaleSwitcherProps {
    className?: string
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
    const { availableLocales, locale, setLocale, t } = useI18n()

    return (
        <select
            aria-label={t("common.locale.switch")}
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
                    {LOCALE_LABELS[item]}
                </option>
            ))}
        </select>
    )
}
