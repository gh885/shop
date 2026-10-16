import { createContext, useContext, type ReactNode } from "react"

/**
 * 壳层通用文案按当前语言的**渲染期**取值（确认框 / 搜索框 / 错误态 / 图片上传 / 区划 / 手机号 / 下拉 / 日期时间 / 脱敏查看）。
 * 用 context 而非模块级单例：单例在 SSR 拿不到（useEffect 不上服务端）、切语言滞后一帧、并发 SSR 下是跨请求共享态；context 的 value 与 locale 同一份数据流，locale 变则消费者重渲染，SSR HTML 直接对。
 * ui-web 是纯 UI 包、不反向依赖 app catalog，所以这里只声明槽位、句子住在 app 的 catalog（§6：组件内不出现用户可见自然语言）。
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

export function useUiLabels(): UiLabels {
    return useContext(UiLabelsContext)
}
