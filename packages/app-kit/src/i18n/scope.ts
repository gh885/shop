import { DEFAULT_LOCALE, type AppLocale } from "@shop/common/i18n" /**
 * 装配时创建的 Locale 持有者实例（i18n.md §3.5 约束 3 的第二档：沿调用链传不动参时才轮到它）。
 *
 * 关键区别是**归属**而不是「把可变变量换个地方放」：它是 app 装配时 new 出来的实例，
 * 谁创建、谁写入、谁读都写在装配处（Provider 写，`configureSdkClient` 的请求头钩子与 `notify` 读），
 * 而不是全仓库共享一份的模块级 `let`。
 *
 * 它仍然只有一个会话一份，所以 **SSR 下它不是请求作用域**：服务端没人写它（Provider 的 effect
 * 不在服务端跑），读到的恒是 `DEFAULT_LOCALE`。服务端出站头的请求级语言走各 app 自己的那条通道
 * （web 是 `shared/lib/request-locale.ts`），见 i18n.md §5.2。
 */
export interface LocaleScope {
    /** 当前 Locale。装配侧没写过就是平台默认值，不是「猜出来的用户语言」 */
    readonly locale: AppLocale
    set(locale: AppLocale): void
}

export function createLocaleScope(initial: AppLocale = DEFAULT_LOCALE): LocaleScope {
    let current = initial
    return {
        get locale() {
            return current
        },
        set(locale: AppLocale) {
            current = locale
        },
    }
}
