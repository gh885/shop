import { ORDER_STATUSES, RMA_STATUSES, RMA_TYPES } from "./constants"

/**
 * wire 词表守卫：契约里订单/售后单的 status、type 都是裸 string（后端枚举见
 * `SellerOrderQuery.DISPLAY_STATUSES` / `Rma.CaseStatus.dbValue()` / `Rma.CaseType`）。
 * 渲染层用它收窄后查词表；认不出的码由调用点兜底展示（secondary 徽章回原码），
 * 不写 `as keyof` 断言——后端加新态时断言会静默变成 undefined 崩在渲染处。
 */

export const isOrderStatus = (status: string): status is (typeof ORDER_STATUSES)[number] =>
    ORDER_STATUSES.some((value) => value === status)

export const isRmaStatus = (status: string): status is (typeof RMA_STATUSES)[number] =>
    RMA_STATUSES.some((value) => value === status)

export const isRmaType = (type: string): type is (typeof RMA_TYPES)[number] =>
    RMA_TYPES.some((value) => value === type)
