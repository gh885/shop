import { PRODUCT_STATUSES } from "./constants"

/**
 * wire 词表守卫：契约里商品列表的 `status` 是裸 string（后端枚举见 `SellerProductQuery.STATUSES`）。
 * 渲染层用它收窄后查 PRODUCT_STATUS_META；认不出的码由调用点兜底展示，不写 `as keyof` 断言。
 */
export const isProductStatus = (status: string): status is (typeof PRODUCT_STATUSES)[number] =>
    PRODUCT_STATUSES.some((value) => value === status)
