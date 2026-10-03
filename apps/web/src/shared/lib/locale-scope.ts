import { createLocaleScope } from "@shop/app-kit/i18n"

/**
 * 本端的 Locale 持有者：全应用就这一个实例，在装配处创建（i18n.md §3.5 约束 3 的第二档）。
 *
 * 三个消费者必须是**同一个值**，否则「界面语言」与「请求头语言」各说各话：
 * - `routes/__root.tsx` 的 `I18nProvider`——唯一写入者；
 * - `shared/api/client.ts` 的 `contextHeaders`——每次出站请求读它；
 * - `app/tanstack-query` 的 `createAppQueryClient`——全局写操作失败提示的兜底文案按它取。
 *
 * SSR 下它不是请求作用域（服务端没人写，读到平台默认）：首屏与出站头的请求级来源是
 * `shared/lib/request-locale.ts` 那条通道，见 i18n.md §5.2。
 */
export const localeScope = createLocaleScope()
