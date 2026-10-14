import { readFile } from "node:fs/promises"
import { parseDocument } from "yaml"
import { z } from "zod"

const contentPolicy = z.strictObject({
    sourceLocale: z.string(),
    requireComplete: z.boolean(),
})
const localePolicy = z.strictObject({
    content: z.record(z.string(), z.strictObject({ fallback: z.array(z.string()) })),
})
const schema = z.strictObject({
    defaultLocale: z.string(),
    platformTimeZone: z.string(),
    contentTypes: z.record(z.string(), contentPolicy),
    locales: z.record(z.string(), localePolicy),
})

export async function readI18nConfig(
    file = new URL("../contracts/i18n.config.yaml", import.meta.url),
) {
    const document = parseDocument(await readFile(file, "utf8"))
    if (document.errors.length > 0) {
        throw new Error(document.errors.map((error) => error.message).join("\n"))
    }
    const config = schema.parse(document.toJS())
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: config.platformTimeZone })
    } catch {
        fail(`platformTimeZone 必须是合法 IANA 时区：${config.platformTimeZone}`)
    }
    const hasContent = (locale, kind) =>
        Object.hasOwn(config.locales, locale) && Object.hasOwn(config.locales[locale].content, kind)
    if (!Object.hasOwn(config.contentTypes, "ui")) fail("必须声明 ui 内容类型")
    if (!hasContent(config.defaultLocale, "ui")) fail("默认语言必须提供 UI")
    for (const [locale, policy] of Object.entries(config.locales)) {
        if (new Intl.Locale(locale).baseName !== locale)
            fail(`Locale 必须是规范 BCP 47 标签：${locale}`)
        for (const [kind, content] of Object.entries(policy.content)) {
            if (!Object.hasOwn(config.contentTypes, kind)) fail(`未知内容类型：${kind}`)
            if (new Set(content.fallback).size !== content.fallback.length)
                fail(`回退目标重复：${locale}/${kind}`)
            for (const target of content.fallback) {
                if (target === locale || !hasContent(target, kind)) {
                    fail(`无效回退目标：${locale}/${kind} → ${target}`)
                }
            }
        }
    }
    for (const [kind, policy] of Object.entries(config.contentTypes)) {
        if (!hasContent(policy.sourceLocale, kind)) fail(`源语言必须提供 ${kind}`)
    }
    return config
}

function fail(message) {
    throw new Error(`i18n.config.yaml: ${message}`)
}

export function renderI18nConfig(config) {
    const supported = Object.keys(config.locales).filter((locale) =>
        Object.hasOwn(config.locales[locale].content, "ui"),
    )
    const tags = supported.map((locale) => JSON.stringify(locale)).join(", ")
    return [
        `export const SUPPORTED_LOCALES = [${tags}] as const`,
        "export type AppLocale = (typeof SUPPORTED_LOCALES)[number]",
        "",
        `export const DEFAULT_LOCALE: AppLocale = ${JSON.stringify(config.defaultLocale)}`,
        `export const SOURCE_LOCALE: AppLocale = ${JSON.stringify(config.contentTypes.ui.sourceLocale)}`,
        "export const FALLBACKS: Record<AppLocale, readonly AppLocale[]> = {",
        ...supported.map((locale) => {
            const targets = config.locales[locale].content.ui.fallback
                .map((target) => JSON.stringify(target))
                .join(", ")
            return `    ${JSON.stringify(locale)}: [${targets}],`
        }),
        "}",
        "",
        `export const PLATFORM_TIME_ZONE = ${JSON.stringify(config.platformTimeZone)}`,
        "",
    ].join("\n")
}
