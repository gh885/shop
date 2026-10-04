import { translate, type I18nInstance, type MessageParams } from "@shop/common/i18n"

export interface LocalizedText {
    key: string
    params?: MessageParams
}
/** 裸串明确表示已成句；结构化 key 必须走翻译和缺失诊断。 */
export type ToastText = string | LocalizedText
export function resolveToastText(text: ToastText, i18n: I18nInstance): string {
    return typeof text === "string" ? text : translate(i18n, text.key, text.params)
}
