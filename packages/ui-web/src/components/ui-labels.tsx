import { createContext, useContext, type ReactNode } from "react"

/**
 * 壳层组件的通用文案（确认框 / 搜索框 / 错误态 / 图片上传 / 区划 / 手机号 / 下拉 / 日期时间 / 脱敏查看）
 * 按当前语言的**渲染期**取值。
 *
 * 此前这九处文案是模块级可变对象，app-kit 的 `I18nProvider` 挂载后用 `configure*Labels` 写它。
 * 那个做法有三个真问题（不是风格偏好）：
 *
 * 1. **SSR 拿不到**：`useEffect` 不在服务端执行，首屏 HTML 里的搜索按钮文字与 aria 为空串，
 *    按钮只剩图标；水合后才被写上，而那次写入不通知 React，于是首屏一直是空的。
 * 2. **切语言滞后一帧**：provider 在「新语言」那次渲染里渲染子树，effect 却在渲染之后才改对象，
 *    子树读到的是上一语言的文案；改完又不触发重渲染，于是同一页面上有的组件立刻换语言、
 *    有的要等下一次交互才换。
 * 3. **并发 SSR 下是跨请求的共享态**：同一个模块对象被所有请求写。
 *
 * context 三条都消掉：value 由 `useMemo(t)` 装配、与 locale 同一份数据流，
 * locale 变则 value 变则消费者重渲染，同一份 SSR 渲染出的 HTML 直接就是对的。
 * 与 `FormErrorTranslateProvider` / `DataTableI18nProvider` 同一条道，这三处在同一条链路上各管一类文案。
 *
 * ui-web 是纯 UI 包、不反向依赖任何 app 的 catalog，所以句子住在 app 的 catalog、
 * 这里只声明「这一层需要哪些槽位」（§6：组件内不出现用户可见的自然语言）。
 *
 * 未挂 provider（ui-web 单测、包外组装）时兜底为**语言中立**的空串：
 * 占位与可访问名为空、按钮只剩图标，与迁移前未注入时的表现逐字一致，不是漏翻。
 */

/** 带槽位的可访问名由调用方（app-kit）用 `t()` 现编；不给时退化为「只念值本身」 */
export interface MaskedValueLabels {
    view: string
    ariaFor: (subject: string | undefined, value: string) => string
}

export interface UiLabels {
    confirm: { cancel: string; confirm: string }
    searchBar: { button: string; placeholder: string; ariaLabel: string }
    stateError: { title: string; retry: string; retrying: string }
    imageUpload: {
        remove: string
        drag: string
        emptyAlt: string
        gridLabel: string
        readError: string
        uploadError: string
    }
    regionPicker: { placeholder: string; searchPlaceholder: string }
    phoneField: { ariaLabel: string; placeholder: string }
    select: { placeholder: string }
    dateTimePicker: {
        placeholder: string
        clear: string
        done: string
        timeAria: (label: string) => string
    }
    maskedValue: MaskedValueLabels
}

const neutralIdentity = <T,>(value: T): T => value

/** 语言中立默认：没有句子就是没有句子，绝不写死某种语言的自然语言 */
export const NEUTRAL_UI_LABELS: UiLabels = {
    confirm: { cancel: "", confirm: "" },
    searchBar: { button: "", placeholder: "", ariaLabel: "" },
    stateError: { title: "", retry: "", retrying: "" },
    imageUpload: {
        remove: "",
        drag: "",
        emptyAlt: "",
        gridLabel: "",
        readError: "",
        uploadError: "",
    },
    regionPicker: { placeholder: "", searchPlaceholder: "" },
    phoneField: { ariaLabel: "", placeholder: "" },
    select: { placeholder: "" },
    dateTimePicker: {
        placeholder: "",
        clear: "",
        done: "",
        // 「时分」那段没有句子可念时，退化成念标签本身（label 通常是「发布时间」这类业务名）
        timeAria: neutralIdentity,
    },
    maskedValue: { view: "", ariaFor: (_subject, value) => value },
}

const UiLabelsContext = createContext<UiLabels>(NEUTRAL_UI_LABELS)

export function UiLabelsProvider({ value, children }: { value: UiLabels; children: ReactNode }) {
    return <UiLabelsContext.Provider value={value}>{children}</UiLabelsContext.Provider>
}

/** 读当前语言的壳层文案；没挂 provider 时退回语言中立默认。 */
export function useUiLabels(): UiLabels {
    return useContext(UiLabelsContext)
}
