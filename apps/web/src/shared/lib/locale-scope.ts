import { createLocaleScope } from "@shop/app-kit"

/**
 * 本端的 Locale 持有者：全应用就这一个实例，在装配处创建（§3.5 约束 3 的第二档）。
 *
 * 三个消费者必须是同一个值，否则「界面语言」与「请求头语言」会各说各的：
 * - `routes/__root.tsx` 的 `I18nProvider`——唯一写入者；
 * - `shared/api/client.ts` 的 `contextHeaders`——每次出站请求读它；
 * - `app/tanstack-query` 的 `createAppQueryClient`——全局写操作失败提示的兜底文案按它取。
 *
 * 它取代的是 `@shop/common` 里那个进程级 `let currentLocale`：web 是 SSR，进程级可变量在并发请求间
 * 会串语言（`shared/api/client.locale.test.ts` 钉的就是这件事）。SSR 阶段没人写它（Provider 的
 * effect 不在服务端跑），所以服务端读到的恒是平台默认值——那正是上面那条测试要用**请求级显式
 * 传参**（而不是 scope）覆盖的路径；§9 P3′-a 让服务端按请求解析语言时才需要按请求建实例。
 */
export const localeScope = createLocaleScope()
