import { createContext, useContext, type ReactNode } from "react"

/**
 * 表单字段错误 → 用户看到的那句话。
 *
 * ui-web 是纯 UI 包，不能反向读任何 app catalog（§4.2、§6）：字段错误在这里只拿到 Zod 抛出的
 * **结构化事实**（`message` 是 catalog key、`params` 是要插进句子里的数据），把它换成句子的动作
 * 由 app-kit 的 `I18nProvider` 按当前语言灌进这个 context——与 `DataTableI18nProvider` 同一条道。
 *
 * 为什么是 context 而不是把消息在 schema 里就地翻好（`makeSchema(t)` 工厂）：
 * - schema 因此与 locale 无关，是模块级常量、切语言不重建、不重跑校验；
 * - 切语言时已显示的错当场跟着 `t` 变（工厂那条要么滞后、要么逼着重新校验）。
 * 与 `configure*Labels` 那些模块级单例的区别同理：单例靠 effect 写、effect 跑在 render 之后，
 * 已挂载的表单会滞后一帧，且并发 SSR 下是跨请求的共享态——context 的 value 随 locale 变，没有这两毛病。
 *
 * 未挂 provider（ui-web 单测、或 app 忘了包）时兜底为「原样」：字符串就是它自己，对象取
 * `message`——与迁移前的行为逐字一致，是语言中立的降级，不是漏翻。
 */
export type FormErrorTranslator = (error: unknown) => string

const passthrough: FormErrorTranslator = (error) => {
    if (typeof error === "string") return error
    if (typeof error === "object" && error !== null && "message" in error) {
        return String(error.message)
    }
    return ""
}

const FormErrorTranslateContext = createContext<FormErrorTranslator>(passthrough)

export function FormErrorTranslateProvider({
    value,
    children,
}: {
    value: FormErrorTranslator
    children: ReactNode
}) {
    return (
        <FormErrorTranslateContext.Provider value={value}>
            {children}
        </FormErrorTranslateContext.Provider>
    )
}

/** 读当前语言的字段错误翻译器；没挂 provider 时退回「原样」。 */
export function useFormErrorTranslator(): FormErrorTranslator {
    return useContext(FormErrorTranslateContext)
}
