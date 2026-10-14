import { isAppLocale, type AppLocale, type I18nResources, type LocaleCatalog } from "@shop/i18n" /**
 * 把 `import.meta.glob` 的 eager 结果（键是资源路径、值是对应那份 catalog）装配成
 * 一份 `I18nResources`——资源路径形状固定为 `<locale>/<namespace>.json`，语言取倒数第二段。
 *
 * 装配走 glob 而不是逐个 import 的理由是判据本身（「所有资源必须被同一份清单覆盖」）：
 * 手写清单会漏文件，而漏掉的那个不是报错，是那部分文案永远不进 codegen、永远不平齐。
 * 旧的校验脚本正是漏了 app-kit 的内联字典才第一次暴露这个失效模式。
 *
 * 于是这里只做两件会让「静默失效」变响的事：
 * - 语言目录名打错（`zh_CN` / `en-GB`）当场抛——不然那份文件等于不存在；
 * - 同一语言内撞 key 当场抛——拆成多个 namespace 文件之后，跨文件撞 key 是静默覆盖。
 */
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
