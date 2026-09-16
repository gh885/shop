export { myOrdersOptions, orderDetailOptions, useMyOrders, useOrderDetail } from "./queries"
export { useOrderActions } from "./use-order-actions"

export { ORDER_STATUS_LABEL, ORDER_STATUS_TABS } from "./constants"
export type { Order, OrderDetail, OrderStatus } from "./model"
/** 共享值对象类型契约在 @shop/api，这里转发省得业务方跨包取 */

export { OrderCard } from "./OrderCard"

export { OrderProgress } from "./OrderProgress"
export { OrderStatusSection } from "./OrderStatusSection"

export { OrderShopSection } from "./OrderShopSection"

export { OrderSummaryCard } from "./OrderSummaryCard"

// ---------- 售后（逆向环：申请 → 卖家处理 → 回寄 → 收货退款） ----------

export { canApplyAfterSale } from "./after-sale"
export type { AfterSaleAction } from "./after-sale"

export { afterSaleOptions, useAfterSale, useCancelAfterSale } from "./after-sale-queries"

export { AfterSaleCard } from "./AfterSaleCard"
export { AfterSaleApplyDialog } from "./AfterSaleApplyDialog"
export { AfterSaleReturnDialog } from "./AfterSaleReturnDialog"
