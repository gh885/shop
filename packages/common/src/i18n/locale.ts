export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = "zh-CN"
export const SOURCE_LOCALE: AppLocale = "zh-CN"
export const LOCALE_COOKIE_NAME = "locale"

export const FALLBACKS: Record<AppLocale, AppLocale | null> = {
    "zh-CN": null,
    "en-US": "zh-CN",
}

const LOCALE_ALIASES: Record<string, AppLocale> = {
    zh: "zh-CN",
    "zh-cn": "zh-CN",
    "zh-hans": "zh-CN",
    "zh-hans-cn": "zh-CN",
    en: "en-US",
    "en-us": "en-US",
    "en-latn-us": "en-US",
}

export function isAppLocale(value: unknown): value is AppLocale {
    return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function normalizeLocale(input: string | null | undefined): AppLocale | null {
    if (!input) return null
    const trimmed = input.trim()
    if (!trimmed) return null
    const normalized = trimmed.replaceAll("_", "-")
    if (isAppLocale(normalized)) return normalized
    return LOCALE_ALIASES[normalized.toLowerCase()] ?? null
}

function acceptLanguageTags(header: string): string[] {
    return header
        .split(",")
        .map((part) => {
            const [rawTag = "", ...params] = part.trim().split(";")
            const qualityParam = params
                .map((param) => param.trim())
                .find((param) => param.startsWith("q="))
            const parsedQuality = qualityParam ? Number.parseFloat(qualityParam.slice(2)) : 1
            return {
                tag: rawTag.trim(),
                quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
            }
        })
        .filter((item) => item.tag.length > 0)
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

export function fallbackChainOf(locale: AppLocale): AppLocale[] {
    const chain: AppLocale[] = []
    let current: AppLocale | null = locale
    while (current) {
        chain.push(current)
        current = FALLBACKS[current]
    }
    return chain
}

let currentLocale: AppLocale = DEFAULT_LOCALE

export function getCurrentLocale(): AppLocale {
    return currentLocale
}

export function setCurrentLocale(locale: AppLocale): void {
    currentLocale = locale
}
