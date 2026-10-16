import { isAppLocale, type AppLocale, type I18nResources, type LocaleCatalog } from "@shop/i18n"
/** glob 装配 catalog → I18nResources；语言目录名打错或跨文件撞 key 当场抛（静默失效变响），见 docs/conventions/i18n.md */
export function assembleLocaleResources(files: Record<string, LocaleCatalog>): I18nResources {
    const catalogs = new Map<AppLocale, Record<string, string>>()
    const owners = new Map<AppLocale, Map<string, string>>()

    for (const [path, catalog] of Object.entries(files)) {
        const segments = path.split("/")
        const locale = segments.at(-2)
        if (locale === undefined || !isAppLocale(locale)) {
            throw new Error(
                `翻译资源的语言目录名不合法：${path}（资源必须放在 <locale>/<namespace>.json，` +
                    `且 <locale> 必须是已登记的语言）`,
            )
        }
        let merged = catalogs.get(locale)
        if (merged === undefined) {
            merged = {}
            catalogs.set(locale, merged)
        }
        let seen = owners.get(locale)
        if (seen === undefined) {
            seen = new Map<string, string>()
            owners.set(locale, seen)
        }
        for (const [key, value] of Object.entries(catalog)) {
            const from = seen.get(key)
            if (from !== undefined) {
                throw new Error(
                    `翻译资源 key 撞车：${locale} 的 "${key}" 同时出现在 ${from} 与 ${path}`,
                )
            }
            seen.set(key, path)
            merged[key] = value
        }
    }

    const resources: I18nResources = {}
    for (const [locale, catalog] of catalogs) resources[locale] = catalog
    return resources
}
