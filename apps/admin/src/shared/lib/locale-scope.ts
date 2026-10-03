import { createLocaleScope } from "@shop/app-kit/i18n"

/**
 * 本端的 Locale 持有者：全应用就这一个实例，在装配处创建（i18n.md §3.5 约束 3 的第二档）。
 *
 * 三个消费者必须是**同一个值**，否则「界面语言」与「请求头语言」各说各话：
 * - `main.tsx` 传给 `mountSpa`，由 `I18nProvider` 写入；
 * - `shared/lib/api.ts` 的 `contextHeaders`——每次出站请求读它；
 * - 同一个 `mountSpa` 调用里交给 `createAppQueryClient`，供全局写操作失败提示取兜底文案。
 */
export const localeScope = createLocaleScope()
