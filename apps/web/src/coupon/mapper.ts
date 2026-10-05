import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"

import type { ClaimableCoupon, MyCoupon } from "./coupon"

/**
 * coupon/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 只归一形状（可空 → undefined），不造假默认值：契约说 `orderId` 可空，就用 undefined 表达「没关联订单」，
 * 不补一个空串；反之必填字段也不兜底 —— 契约收紧后兜底只会掩盖漂移。
 */

/** 券包 wire → 业务：唯一需要归一的是可空的 orderId（null → undefined）；unavailableReason 随展开透传 */
export function toMyCoupon(dto: MyCouponResponse): MyCoupon {
    return { ...dto, orderId: dto.orderId ?? undefined }
}

/** 可领券 wire → 业务：现零归一，函数存在的意义是守住「wire → 领域」这一道边界 */
export function toClaimableCoupon(dto: ClaimableCouponResponse): ClaimableCoupon {
    return { ...dto }
}
