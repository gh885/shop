import { DEFAULT_LOCALE, type AppLocale } from "@shop/common/i18n" /**
 * 装配时创建的 Locale 持有者实例（§3.5 约束 3 的第二档：沿调用链传不动参时才轮到它）。
 *
 * 与被它替换掉的 `getCurrentLocale()` 的区别不是「把可变变量换个地方放」：
 * - 那个是 `@shop/common` 里的一个 `let`，三端、SSR 的每个请求、后端探针、测试全共用一份；
 * - 这个是 **app 装配时 new 出来的实例**，谁创建、谁写入、谁读都写在装配处
 *   （Provider 写，`configureSdkClient` 的请求头钩子与 `notify` 读）。
 *
 * 它仍然只有一个会话一份，所以 **SSR 下它不是请求作用域**：服务端没人写它（Provider 的 effect
 * 不在服务端跑），读到的恒是 `DEFAULT_LOCALE`。§9 P3′-a 让服务端按请求解析语言时，要么按请求
 * 创建实例，要么换成请求上下文——这一步只是把那条串语言的通道从包里搬到了装配处，看得见它。
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
