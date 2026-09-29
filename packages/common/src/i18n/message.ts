import { IntlMessageFormat } from "intl-messageformat"

import { DEFAULT_LOCALE, fallbackChainOf, type AppLocale } from "./locale"

export type LocaleMessageValue = string
export type LocaleCatalog = Readonly<Record<string, LocaleMessageValue>>
export type I18nResources = Partial<Record<AppLocale, LocaleCatalog>>
export type MessageParams = Record<string, string | number | boolean | null | undefined>

export function lookupMessage(catalog: LocaleCatalog | undefined, key: string): string | undefined {
    if (!catalog) return undefined
    return catalog[key]
}

export function resolveMessage(
    resources: I18nResources,
    key: string,
    locale: AppLocale,
): string | undefined {
    for (const candidate of fallbackChainOf(locale)) {
        const message = lookupMessage(resources[candidate], key)
        if (message !== undefined) return message
    }
    return undefined
}

/**
 * §5.1 的两条契约都收在这一层：坏 ICU 的 `SyntaxError` 出不了 `compile()`，
 * 而 `formatMessage` 永远返回字符串——`t()` 是同步返回文案的，白屏就是这么防住的。
 *
 * 编译结果按 (locale, template) 缓存，坏模板也进缓存（存 `undefined`）：否则每条坏消息
 * 每次都重新抛一次 `SyntaxError`，代价挂在渲染次数上。
 */
const compiled = new Map<string, IntlMessageFormat | undefined>()

function compile(template: string, locale: AppLocale): IntlMessageFormat | undefined {
    const id = `${locale}\u0000${template}`
    if (compiled.has(id)) return compiled.get(id)
    let message: IntlMessageFormat | undefined
    try {
        message = new IntlMessageFormat(template, locale)
    } catch {
        message = undefined
    }
    compiled.set(id, message)
    return message
}

/** 模板本身是否可用（缺参数与坏 ICU 是两件事，这里只看后者）。`t()` 用它把坏消息降级成 key。 */
export function isMessageValid(template: string, locale: AppLocale): boolean {
    return compile(template, locale) !== undefined
}

function formatParam(
    value: string | number | boolean | null | undefined,
): string | number | boolean {
    if (value === null || value === undefined) return ""
    return value
}

export function formatMessage(
    template: string,
    params: MessageParams = {},
    locale: AppLocale = DEFAULT_LOCALE,
): string {
    const message = compile(template, locale)
    if (message === undefined) return template
    const values: Record<string, string | number | boolean> = {}
    for (const [name, value] of Object.entries(params)) {
        values[name] = formatParam(value)
    }
    try {
        return String(message.format(values))
    } catch {
        // 参数缺失/类型不符：原样给回模板，与旧的「{name} 没传就留着」表现一致
        return template
    }
}
