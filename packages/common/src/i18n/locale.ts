import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "./config.gen"

export {
    DEFAULT_LOCALE,
    FALLBACKS,
    SOURCE_LOCALE,
    SUPPORTED_LOCALES,
    type AppLocale,
} from "./config.gen"

export const LOCALE_COOKIE_NAME = "locale"

export function isAppLocale(value: unknown): value is AppLocale {
    return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function normalizeLocale(input: string | null | undefined): AppLocale | null {
    if (!input?.trim()) return null
    try {
        const requested = new Intl.Locale(input.trim().replaceAll("_", "-"))
        if (isAppLocale(requested.baseName)) return requested.baseName
        return (
            SUPPORTED_LOCALES.find((locale) => {
                const supported = new Intl.Locale(locale)
                if (supported.language !== requested.language) return false
                if (requested.script && supported.script && requested.script !== supported.script)
                    return false
                if (
                    !requested.script &&
                    requested.region &&
                    supported.script &&
                    requested.region !== supported.region
                )
                    return false
                return true
            }) ?? null
        )
    } catch {
        return null
    }
}

export function localeLabel(locale: AppLocale): string {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
}

function acceptLanguageTags(header: string): string[] {
    return header
        .split(",")
        .map((part) => {
            const [rawTag = "", ...params] = part.trim().split(";")
            const qualityParam = params
                .map((param) => param.trim())
                .find((param) => param.startsWith("q="))
            const parsedQuality = qualityParam ? Number(qualityParam.slice(2)) : 1
            return {
                tag: rawTag.trim(),
                quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
            }
        })
        .filter((item) => item.tag.length > 0 && item.quality > 0 && item.quality <= 1)
        .sort((a, b) => b.quality - a.quality)
        .map((item) => item.tag)
}

export function resolveLocale(candidates: ReadonlyArray<string | null | undefined>): AppLocale {
    for (const candidate of candidates) {
        if (!candidate) continue
        for (const tag of acceptLanguageTags(candidate)) {
            const locale = normalizeLocale(tag)
            if (locale) return locale
        }
    }
    return DEFAULT_LOCALE
}
