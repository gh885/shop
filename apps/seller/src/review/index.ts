/**
 * review —— 卖家侧的订单评价：看本店评价 + 回复一次（REV-10）。
 *
 * 规则见 docs/business-rules/review.md。列表与回复都在本域：页面只管取数与分页，
 * 表格（`table.tsx`）只管画，回复弹窗（`reply-dialog.tsx`）只管收一段话并发出去。
 */
export { ReviewTable } from "./table"
export { shopReviewsOptions } from "./queries"
