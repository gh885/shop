import type { DataGridI18nLabels, DataTableI18nValue } from "@shop/ui-web"

import type { MessageParams } from "@shop/i18n"

/** 与 app-kit I18nProvider 里的 `t` 同形（按当前语言解析 appKit catalog） */
type Translate = (key: string, params?: MessageParams) => string

/** ui-web 不能反向读 catalog，装配住 app-kit；`t` 随 locale 变 → 对象身份变 → DataTable 当场重渲染，切语言无滞后 */
export function buildDataTableI18n(t: Translate): DataTableI18nValue {
    const labels: DataGridI18nLabels = {
        sortAscending: t("ui.dataTable.sortAscending"),
        sortDescending: t("ui.dataTable.sortDescending"),
        columnsMenu: t("ui.dataTable.columnsMenu"),
        toggleColumns: t("ui.dataTable.toggleColumns"),
        pinColumnStart: t("ui.dataTable.pinColumnStart"),
        pinColumnEnd: t("ui.dataTable.pinColumnEnd"),
        moveColumnStart: t("ui.dataTable.moveColumnStart"),
        moveColumnEnd: t("ui.dataTable.moveColumnEnd"),
        unpinColumn: (title) => t("ui.dataTable.unpinColumn", { title }),
        rowCreate: t("ui.dataTable.rowCreate"),
        pinRow: t("ui.dataTable.pinRow"),
        unpinRow: t("ui.dataTable.unpinRow"),
        selectRow: t("ui.dataTable.selectRow"),
        selectAll: t("ui.dataTable.selectAll"),
        expandRow: t("ui.dataTable.expandRow"),
        collapseRow: t("ui.dataTable.collapseRow"),
        dragToReorder: t("ui.dataTable.dragToReorder"),
        dragToReorderRow: t("ui.dataTable.dragToReorderRow"),
        reorderingUnavailable: t("ui.dataTable.reorderingUnavailable"),
        loading: t("ui.dataTable.loading"),
        empty: t("ui.dataTable.empty"),
        allRowsLoaded: t("ui.dataTable.allRowsLoaded"),
        rowsPerPage: t("ui.dataTable.rowsPerPage"),
        paginationInfo: ({ from, to, count }) =>
            t("ui.dataTable.paginationInfo", { from, to, count }),
        previousPage: t("ui.dataTable.previousPage"),
        nextPage: t("ui.dataTable.nextPage"),
        goToPage: (page) => t("ui.dataTable.goToPage", { page }),
        paginationEllipsis: t("ui.dataTable.paginationEllipsis"),
        filterSelectedCount: (count) => t("ui.dataTable.filterSelectedCount", { count }),
        filterNoResults: t("ui.dataTable.filterNoResults"),
        filterClear: t("ui.dataTable.filterClear"),
    }

    return {
        overrides: { labels },
        emptyText: labels.empty,
        columnsLabel: labels.columnsMenu,
        resetText: t("ui.dataTable.reset"),
    }
}
