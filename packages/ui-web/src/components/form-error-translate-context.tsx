import { createContext, useContext, type ReactNode } from "react"

/**
 * 表单字段错误 → 用户看到的那句话。ui-web 是纯 UI 包，不反向读 app catalog（§4.2、§6）：这里只拿到 Zod 的结构化事实（`message`=catalog key、`params`=插句子的数据），换成句子的动作由 app-kit 的 I18nProvider 按当前语言灌进本 context（与 DataTableI18nProvider 同一条道）。
 *
 * 用 context 而非在 schema 里就地翻好（makeSchema(t) 工厂）：schema 与 locale 解耦、切语言不重建也不重跑校验，且已显示的错当场跟着 t 变；模块级单例那套靠 effect 写会滞后一帧、并发 SSR 下跨请求共享，context 的 value 随 locale 变没这两毛病。
 * 未挂 provider 时兜底「原样」（字符串即自身、对象取 message）：语言中立的降级，不是漏翻。
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

export function useFormErrorTranslator(): FormErrorTranslator {
    return useContext(FormErrorTranslateContext)
}
