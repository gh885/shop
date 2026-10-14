export const SUPPORTED_LOCALES = ["en-US", "zh-Hans-CN"] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = "zh-Hans-CN"
export const SOURCE_LOCALE: AppLocale = "zh-Hans-CN"
export const FALLBACKS: Record<AppLocale, readonly AppLocale[]> = {
    "en-US": [],
    "zh-Hans-CN": ["en-US"],
}
