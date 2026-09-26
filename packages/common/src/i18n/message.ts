import { fallbackChainOf, type AppLocale } from "./locale"

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

function formatParam(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) return ""
    return String(value)
}

function findBlockEnd(template: string, start: number): number {
    let depth = 0
    for (let i = start; i < template.length; i += 1) {
        const char = template[i]
        if (char === "{") depth += 1
        if (char === "}") {
            depth -= 1
            if (depth === 0) return i
        }
    }
    return -1
}

function parseOptions(body: string): Map<string, string> {
    const options = new Map<string, string>()
    const optionPattern = /([=\w]+)\s*\{([^{}]*)\}/g
    let option: RegExpExecArray | null
    while ((option = optionPattern.exec(body)) !== null) {
        const optionKey = option[1]
        const optionValue = option[2]
        if (optionKey && optionValue !== undefined) {
            options.set(optionKey, optionValue)
        }
    }
    return options
}

function selectPlural(
    options: Map<string, string>,
    value: string | number | boolean | null | undefined,
    locale: AppLocale,
): string {
    const numeric = Number(value)
    const safeValue = Number.isFinite(numeric) ? numeric : 0
    const exact = options.get(`=${safeValue}`)
    const category = new Intl.PluralRules(locale).select(safeValue)
    const content = exact ?? options.get(category) ?? options.get("other") ?? formatParam(value)
    return content.replaceAll("#", formatParam(value))
}

function selectOption(
    options: Map<string, string>,
    value: string | number | boolean | null | undefined,
): string {
    const selected = formatParam(value)
    return options.get(selected) ?? options.get("other") ?? selected
}

function replaceIcuBlocks(
    template: string,
    params: MessageParams,
    locale: AppLocale,
    kind: "plural" | "select",
): string {
    const startPattern = new RegExp(`\\{(\\w+),\\s*${kind},`)
    let result = template
    let match: RegExpExecArray | null
    while ((match = startPattern.exec(result)) !== null) {
        const key = match[1] ?? ""
        const start = match.index
        const end = findBlockEnd(result, start)
        if (end === -1) break

        const body = result.slice(start + match[0].length, end)
        const options = parseOptions(body)
        const value = params[key]
        const content =
            kind === "plural" ? selectPlural(options, value, locale) : selectOption(options, value)

        result = result.slice(0, start) + content + result.slice(end + 1)
    }
    return result
}

function replaceSimpleParams(template: string, params: MessageParams): string {
    return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
        if (!(name in params)) return match
        return formatParam(params[name])
    })
}

export function formatMessage(
    template: string,
    params: MessageParams = {},
    locale: AppLocale = "zh-CN",
): string {
    let result = replaceIcuBlocks(template, params, locale, "plural")
    result = replaceIcuBlocks(result, params, locale, "select")
    return replaceSimpleParams(result, params)
}
