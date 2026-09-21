/**
 * coupon —— 卖家优惠券域（扁形态）。
 *
 * - model.ts   ：列表 URL 状态 schema、展示状态派生（纯函数）、wire → 领域投影
 * - form.ts    ：新建表单的 Zod 校验与「表单形状 → 后端请求」投影（元 → 分、本地时间 → ISO 时刻）
 * - data.ts    ：SDK 调用封装（SellerCouponsApi）
 * - queries.ts ：TanStack Query 接线（列表 / 建券 / 停券）
 * - CouponPage.tsx / CouponTable.tsx / CouponFormDialog.tsx ：页面、列表与表单弹窗
 *
 * 端点用店铺上下文取 shopId（传输层注入 X-Shop-Id），前端不传店 ID；
 * 权限 COUPON_MANAGE 由后端校验，前端不做权限隐藏，403 统一走 notify.fromError。
 */

export { CouponPage } from "./CouponPage"
export { couponListSearchSchema, type CouponListSearch } from "./model"
