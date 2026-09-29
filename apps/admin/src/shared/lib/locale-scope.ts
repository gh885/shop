import { createLocaleScope } from "@shop/app-kit"

/**
 * 本端的 Locale 持有者：全应用就这一个实例，在装配处创建（§3.5 约束 3 的第二档）。
 *
 * 三个消费者必须是同一个值，否则「界面语言」与「请求头语言」会各说各的：
 * - `main.tsx` 传给 `mountSpa`，由 `I18nProvider` 写入；
 * - `shared/lib/api.ts` 的 `contextHeaders`——每次出站请求读它；
 * - 同一个 `mountSpa` 调用里交给 `createAppQueryClient`，供全局写操作失败提示取兜底文案。
 *
 * 它取代的是 `@shop/common` 里那个进程级 `let currentLocale`：admin 的表格列定义是模块级数组，
 * 以前在那里调 `format*` 读到的是「别的请求/别处刚写过的语言」。现在那个位置只能显式取
 * `localeScope.locale`（§3.5），或干脆走组件里的 `useI18n().locale`。
 */
export const localeScope = createLocaleScope()
