import { createContext, useContext, type ReactNode } from "react"

import type { DataGridI18nOverrides } from "../reui/data-grid/data-grid-i18n"

/**
 * DataGrid 项目文案（分页/列显隐/排序等 30 条）与空态由 app-kit 的 I18nProvider 按当前语言灌进此 context——ui-web 是纯 UI 包，不反向读 app catalog（§4.2、§6）。
 * 用 context 而非 locale prop / 模块级单例：prop 三端没传恒为中文；单例靠 effect 写入、切语言不重渲染会滞后一帧。未挂 provider 时兜底 reui 英文 + 空串（语言中立，非漏翻）。
 */
export interface DataTableI18nValue {
    /** 浅合并进 reui DataGrid 的 `i18n`，缺项走 reui 英文 */
    overrides: DataGridI18nOverrides
    /** labels.empty 与 DataTable 自渲染 EmptyTitle 的唯一来源 */
    emptyText: string
    /** 列显隐触发器上那句 */
    columnsLabel: string
    /** 工具栏「清除筛选」按钮文字（工具栏不在 reui DataGrid 标签集里，故单列） */
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

/** 读当前语言的 DataGrid 文案；没挂 provider 时返回语言中立兜底 */
export function useDataTableI18n(): DataTableI18nValue {
    return useContext(DataTableI18nContext)
}
