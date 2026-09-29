import { createLocaleScope } from "@shop/app-kit"

/**
 * 本端的 Locale 持有者：全应用就这一个实例，在装配处创建（§3.5 约束 3 的第二档）。
 *
 * 三个消费者必须是同一个值，否则「界面语言」与「请求头语言」会各说各的：
 * - `main.tsx` 传给 `mountSpa`，由 `I18nProvider` 写入；
 * - `shared/lib/api.ts` 的 `contextHeaders`——每次出站请求读它；
 * - 同一个 `mountSpa` 调用里交给 `createAppQueryClient`，供全局写操作失败提示取兜底文案。
 *
 * 与 `shop-store.ts` 同形状（模块级持有者 + 拦截器注入），差别只在它替换的是 `@shop/common` 里
 * 那个进程级 `let currentLocale`：那个是全仓库共享的，测试与别的 app 都会读到它。
 */
export const localeScope = createLocaleScope()
