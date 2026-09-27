/**
 * review —— 买家评价（提交 / 我的评价 / 追评）+ 商品评价公开读（商详评价区）。
 *
 * 规则见 docs/business-rules/review.md（REV-01~17）。本域只做三件事：
 * 取数（queries.ts）、评价区展示（ProductReviews.tsx）、买家侧提交与追评（ReviewDialog.tsx）。
 * 好评率、平均星级一律读后端聚合（`ProductReviewSummary`），前端不重算（CPN-55 同口径：能算的不在两端各算一次）。
 */
export { ProductReviews } from "./ProductReviews"
export { ReviewDialog } from "./ReviewDialog"
