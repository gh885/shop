import { translate, type I18nInstance, type MessageParams } from "@shop/common/i18n"

export interface LocalizedText {
    key: string
    params?: MessageParams
}
/**
 * 写操作回执的唯一形态：只收结构化 `{ key, params }`。
 *
 * 迁移期这里曾是 `string | LocalizedText`——裸串是给「尚未迁移的旧调用点」留的兼容旁路（原样显示、
 * 不进翻译、不进缺失诊断）。铺量已收口，这条旁路就是「裸中文重新混进去」的那道口子，删掉：
 * 现在 `meta.success` / `notify.*` / `fromError` 的 fallback 一律要求 `key`，写裸串当场编译不过。
 * `key` 的类型仍是 `string`：app-kit 是共享层、看不见三端各自的 catalog（§5.5），把 key 收成各端
 * 联合这件事结构上做不到——拼错 key 由运行时 `i18n_missing_key` 上报与 codegen 覆盖，不靠这里的类型。
 */
export type ToastText = LocalizedText
export function resolveToastText(text: ToastText, i18n: I18nInstance): string {
    return translate(i18n, text.key, text.params)
}
