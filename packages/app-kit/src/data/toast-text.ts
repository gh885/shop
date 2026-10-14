import { translate, type CheckedMessageFact, type I18nInstance } from "@shop/i18n"

/** 调用处经 catalog 工厂检查 key/参数，弹出时才按当前语言翻译。 */
export type ToastText = CheckedMessageFact

export function resolveToastText(text: ToastText, i18n: I18nInstance): string {
    return translate(i18n, text.message, text.params)
}
