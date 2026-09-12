export { useMyOrders, useOrderDetail, useCancelOrder, useReceiveOrder } from "./queries"
export { useOrderActions } from "./use-order-actions"

export { ORDER_STATUS_LABEL } from "./model"
export type { Order, OrderDetail, OrderStatus } from "./model"
/** 共享值对象类型契约在 @shop/api，这里转发省得业务方跨包取 */

export { OrderCard } from "./OrderCard"
export type { OrderAction } from "./OrderActionButtons"

export { OrderProgress } from "./OrderProgress"
export { OrderStatusSection } from "./OrderStatusSection"

export { OrderShopSection } from "./OrderShopSection"

export { OrderSummaryCard } from "./OrderSummaryCard"

// ---------- 售后（逆向环：申请 → 卖家处理 → 回寄 → 收货退款） ----------

export {
    AFTER_SALE_TYPE_HINT,
    AFTER_SALE_TYPE_LABEL,
    TICKET_STATUS_LABEL,
    buyerAfterSaleActions,
    canApplyAfterSale,
} from "./after-sale"
export type { AfterSaleAction, AfterSaleTicket } from "./after-sale"

export {
    AFTER_SALE_KEY,
    useAfterSale,
    useApplyAfterSale,
    useCancelAfterSale,
    useReturnAfterSale,
} from "./after-sale-queries"

export { AfterSaleCard } from "./AfterSaleCard"
export { AfterSaleApplyDialog } from "./AfterSaleApplyDialog"
export { AfterSaleReturnDialog } from "./AfterSaleReturnDialog"
