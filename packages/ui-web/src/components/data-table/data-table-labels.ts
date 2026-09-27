import type { DataGridI18nOverrides } from "src/components/reui/data-grid/data-grid-i18n"

/**
 * reui DataGrid 的中文/英文文案。
 *
 * reui 的默认标签全英文（见 reui/data-grid/data-grid-i18n.tsx），而 `i18n` 是 DataGrid 的
 * prop、分页与列显隐又从 provider 读它——所以整个项目只在这里覆写一次，调用点不重复传。
 * 空态那句也只在 EMPTY_TEXT 里写一遍：`labels.empty` 与 DataTable 自己渲染的 EmptyTitle
 * 是两个消费方，抄成两份就会一句话两个答案。
 */

/** 表格能收的语言档（与 DataTable / DateTimeField 的 locale prop 同形） */
export type DataTableLocale = "zh-CN" | "en-US"

const EMPTY_TEXT: Record<DataTableLocale, string> = {
    "zh-CN": "暂无数据",
    "en-US": "No data",
}

const ZH_LABELS: DataGridI18nOverrides = {
    labels: {
        sortAscending: "升序",
        sortDescending: "降序",
        columnsMenu: "列",
        toggleColumns: "显示列",
        pinColumnStart: "固定到左侧",
        pinColumnEnd: "固定到右侧",
        moveColumnStart: "移到左侧",
        moveColumnEnd: "移到右侧",
        unpinColumn: (title) => `取消固定「${title}」列`,
        rowCreate: "新增行",
        pinRow: "固定行",
        unpinRow: "取消固定行",
        selectRow: "选择该行",
        selectAll: "全选",
        expandRow: "展开",
        collapseRow: "收起",
        dragToReorder: "拖动排序",
        dragToReorderRow: "拖动调整行序",
        reorderingUnavailable: "当前不可排序",
        loading: "正在加载列表",
        empty: EMPTY_TEXT["zh-CN"],
        allRowsLoaded: "已加载全部",
        rowsPerPage: "每页",
        paginationInfo: ({ from, to, count }) => `第 ${from}-${to} 条 · 共 ${count} 条`,
        previousPage: "上一页",
        nextPage: "下一页",
        goToPage: (page) => `第 ${page} 页`,
        paginationEllipsis: "…",
        filterSelectedCount: (count) => `已选 ${count} 项`,
        filterNoResults: "无匹配结果",
        filterClear: "清除筛选",
    },
}

const EN_LABELS: DataGridI18nOverrides = {
    labels: {
        sortAscending: "Sort ascending",
        sortDescending: "Sort descending",
        columnsMenu: "Columns",
        toggleColumns: "Toggle columns",
        pinColumnStart: "Pin to start",
        pinColumnEnd: "Pin to end",
        moveColumnStart: "Move to start",
        moveColumnEnd: "Move to end",
        unpinColumn: (title) => `Unpin ${title} column`,
        rowCreate: "Add row",
        pinRow: "Pin row",
        unpinRow: "Unpin row",
        selectRow: "Select row",
        selectAll: "Select all",
        expandRow: "Expand",
        collapseRow: "Collapse",
        dragToReorder: "Drag to reorder",
        dragToReorderRow: "Drag to reorder row",
        reorderingUnavailable: "Reordering unavailable",
        loading: "Loading list",
        empty: EMPTY_TEXT["en-US"],
        allRowsLoaded: "All rows loaded",
        rowsPerPage: "Rows per page",
        paginationInfo: ({ from, to, count }) => `${from}-${to} of ${count}`,
        previousPage: "Previous page",
        nextPage: "Next page",
        goToPage: (page) => `Go to page ${page}`,
        paginationEllipsis: "…",
        filterSelectedCount: (count) => `${count} selected`,
        filterNoResults: "No results",
        filterClear: "Clear filter",
    },
}

/** 按语言取那一套覆写（未给语言时由 DataTable 自己按 zh-CN 兜底） */
export function dataGridI18nOf(locale: DataTableLocale): DataGridI18nOverrides {
    return locale === "en-US" ? EN_LABELS : ZH_LABELS
}

/** 空态标题那句：与 labels.empty 同一处定义，改文案只改 EMPTY_TEXT */
export function emptyTextOf(locale: DataTableLocale): string {
    return EMPTY_TEXT[locale]
}
