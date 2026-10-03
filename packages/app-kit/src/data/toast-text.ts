import {
    formatMessage,
    isMessageValid,
    resolveMessage,
    type AppLocale,
    type I18nResources,
    type MessageParams,
} from "@shop/common/i18n"

import { APP_KIT_MESSAGES } from "../i18n/messages"

/**
 * 写操作 toast 的一句话——「结构化事实」形态，与校验消息（i18n.md §6.1）同一条道。
 *
 * 为什么 `meta.success` 不直接存成品句而存 key：句子焊在调用点 = 切语言时**已创建的 meta** 带着
 * 旧语言，而 `MutationCache` 是仓库唯一「拿不到 hook、又必须知道当前语言」的写回调（§3.5 约束 3）。
 * 存 key 让语言到 `onSuccess` 触发那一刻才现取，切语言后下一条 toast 立即是新语言。
 *
 * `key` 用 `string` 而非某端 catalog 的联合类型：app-kit 够不到各 app 的 catalog（§4.2 边界，
 * ui-web/app-kit 都不读 app catalog）。编译期的 key 校验交给调用侧的 `Extract<SellerMessageKey, …>`
 * 工厂（与 `err()` 同法），这里只负责运行时按 locale 换句子。
 */
export interface LocalizedText {
    key: string
    /** 进句子的数据（上限、名称等），与 `MessageParams` 同形 */
    params?: MessageParams
}

/** 一条写操作回执：裸串（旧调用点，尚未迁移）或结构化 key（迁移后） */
export type ToastText = string | LocalizedText

/**
 * 把回执换成当前语言的句子。解析链与 `provider.tsx` 的 `translateFieldError` 逐字同构：
 * 先 app catalog、回落 app-kit catalog、命中坏 ICU 或缺 key 都**原样返回、不报 `i18n_missing_key`**
 * ——没迁移的调用点把中文写死在这里，那是成品句不是漏 key，走 `t()` 会每条 toast 刷一次上报。
 *
 * 非 React 调用（全局 MutationCache），语言由调用方传 `scope.locale`（装配注入的那一份，§3.5）。
 */
export function resolveToastText(
    text: ToastText,
    locale: AppLocale,
    resources: I18nResources,
): string {
    if (typeof text === "string") return text
    const template =
        resolveMessage(resources, text.key, locale) ??
        resolveMessage(APP_KIT_MESSAGES, text.key, locale)
    if (template !== undefined && isMessageValid(template, locale)) {
        return formatMessage(template, text.params, locale)
    }
    return text.key
}
