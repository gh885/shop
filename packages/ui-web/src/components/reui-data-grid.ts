/**
 * reui DataGrid 对外出口（vendored 组件，见 ./reui/README.md）。
 *
 * 刻意只导出渲染一个数据表用得到的积木：DataGrid（provider）+ DataGridContainer（外壳）
 * + DataGridTable（表体）。分页（data-grid-pagination）与列显隐/筛选（column-filter/
 * column-visibility）**不**在这里导出——取数与列显隐归 TanStack Query 与调用方，
 * 由上层按需自行组合，不让第三方组件接管。
 */
export { DataGrid, DataGridContainer } from "./reui/data-grid/data-grid"
export { DataGridTable } from "./reui/data-grid/data-grid-table"
export type { DataGridTableInstance } from "./reui/data-grid/data-grid"
export type { DataGridFeatures } from "./reui/data-grid/data-grid"
