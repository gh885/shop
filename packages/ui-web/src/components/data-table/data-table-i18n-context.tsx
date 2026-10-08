import { createContext, useContext, type ReactNode } from "react"

import type { DataGridI18nOverrides } from "../reui/data-grid/data-grid-i18n"

/**
 * DataGrid 那一层的项目文案（分页/列显隐/排序等 30 条）与空态那句，由 app-kit 的 I18nProvider
 * 按当前语言构建后灌进这个 context——ui-web 是纯 UI 包，不能反向读任何 app catalog（§4.2、§6）。
 *
 * 为什么是 context 而不是 `locale` prop 或模块级 configure 单例：
 * - 原来的 `locale` prop 三端一处都没传，表格恒为 zh-Hans-CN，英文站露中文——是条一直没接上的死路；
 * - 模块级单例（confirm 那套）靠 provider 的 effect 写入，而 effect 跑在 render 之后，切语言时
 *   已挂载的表不会因此重渲染，会滞后一帧。context 的 value 随 locale 变、DataTable 是它的消费者，
 *   切语言当场重渲染并同步取到新文案——语言、时点都对。
 *
 * 未挂 provider（如 ui-web 单测）时兜底为 reui 自带默认（英文）+ 空串：语言中立，不是漏翻。
 */
export interface DataTableI18nValue {
    /** 直接喂给 reui DataGrid 的 `i18n`（浅合并进 reui 默认，缺项走 reui 的英文） */
    overrides: DataGridI18nOverrides
    /** 空态那句（同时是 labels.empty 与 DataTable 自渲染 EmptyTitle 的唯一来源） */
    emptyText: string
    /** 列显隐触发器上那句（与 labels.columnsMenu 同词，单独给出来方便按钮取用） */
    columnsLabel: string
    /** 工具栏「清除筛选」那颗按钮的文字（工具栏不在 reui DataGrid 的标签集里，单列一条） */
    resetText: string
}

const fallback: DataTableI18nValue = {
    overrides: {},
    emptyText: "",
    columnsLabel: "",
    resetText: "",
}

const DataTableI18nContext = createContext<DataTableI18nValue>(fallback)

export function DataTableI18nProvider({
    value,
    children,
}: {
    value: DataTableI18nValue
    children: ReactNode
}) {
    return <DataTableI18nContext.Provider value={value}>{children}</DataTableI18nContext.Provider>
}

/** 读当前语言的那份 DataGrid 文案；没挂 provider 时返回语言中立兜底 */
export function useDataTableI18n(): DataTableI18nValue {
    return useContext(DataTableI18nContext)
}
