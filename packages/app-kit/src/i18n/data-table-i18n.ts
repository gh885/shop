import type { DataGridI18nLabels, DataTableI18nValue } from "@shop/ui-web"

import type { MessageParams } from "@shop/common/i18n"

/** 与 app-kit I18nProvider 里的 `t` 同形（按当前语言解析 appKit catalog） */
type Translate = (key: string, params?: MessageParams) => string

/**
 * 按当前语言把 reui DataGrid 的 30 条标签与空态那句从 `appKit.ui.dataTable.*` 组装出来，喂给 ui-web
 * 的 DataTableI18n context。ui-web 不能反向读 catalog（§4.2、§6），所以这份装配住在 app-kit：
 * provider 的 `t` 随 locale 变 → 这里产出的对象身份随之变 → context 消费者（DataTable）当场重渲染，
 * 切语言无滞后。带槽位的几条（unpinColumn/paginationInfo/goToPage/filterSelectedCount）用参数取。
 */
export function buildDataTableI18n(t: Translate): DataTableI18nValue {
    const labels: DataGridI18nLabels = {
        sortAscending: t("appKit.ui.dataTable.sortAscending"),
        sortDescending: t("appKit.ui.dataTable.sortDescending"),
        columnsMenu: t("appKit.ui.dataTable.columnsMenu"),
        toggleColumns: t("appKit.ui.dataTable.toggleColumns"),
        pinColumnStart: t("appKit.ui.dataTable.pinColumnStart"),
        pinColumnEnd: t("appKit.ui.dataTable.pinColumnEnd"),
        moveColumnStart: t("appKit.ui.dataTable.moveColumnStart"),
        moveColumnEnd: t("appKit.ui.dataTable.moveColumnEnd"),
        unpinColumn: (title) => t("appKit.ui.dataTable.unpinColumn", { title }),
        rowCreate: t("appKit.ui.dataTable.rowCreate"),
        pinRow: t("appKit.ui.dataTable.pinRow"),
        unpinRow: t("appKit.ui.dataTable.unpinRow"),
        selectRow: t("appKit.ui.dataTable.selectRow"),
        selectAll: t("appKit.ui.dataTable.selectAll"),
        expandRow: t("appKit.ui.dataTable.expandRow"),
        collapseRow: t("appKit.ui.dataTable.collapseRow"),
        dragToReorder: t("appKit.ui.dataTable.dragToReorder"),
        dragToReorderRow: t("appKit.ui.dataTable.dragToReorderRow"),
        reorderingUnavailable: t("appKit.ui.dataTable.reorderingUnavailable"),
        loading: t("appKit.ui.dataTable.loading"),
        empty: t("appKit.ui.dataTable.empty"),
        allRowsLoaded: t("appKit.ui.dataTable.allRowsLoaded"),
        rowsPerPage: t("appKit.ui.dataTable.rowsPerPage"),
        paginationInfo: ({ from, to, count }) =>
            t("appKit.ui.dataTable.paginationInfo", { from, to, count }),
        previousPage: t("appKit.ui.dataTable.previousPage"),
        nextPage: t("appKit.ui.dataTable.nextPage"),
        goToPage: (page) => t("appKit.ui.dataTable.goToPage", { page }),
        paginationEllipsis: t("appKit.ui.dataTable.paginationEllipsis"),
        filterSelectedCount: (count) => t("appKit.ui.dataTable.filterSelectedCount", { count }),
        filterNoResults: t("appKit.ui.dataTable.filterNoResults"),
        filterClear: t("appKit.ui.dataTable.filterClear"),
    }

    return {
        overrides: { labels },
        emptyText: labels.empty,
        columnsLabel: labels.columnsMenu,
        resetText: t("appKit.ui.dataTable.reset"),
    }
}
