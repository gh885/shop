import type {
    CouponTemplateResponse,
    CreateCouponTemplateRequest,
    PageResultCouponTemplateResponse,
} from "@shop/api/sdk"
import { SellerCouponsApi } from "@shop/api/sdk"

/**
 * coupon 域 · SDK 调用封装。
 *
 * 端点用店铺上下文取 shopId（传输层注入 X-Shop-Id），前端不传店 ID——
 * 传了就多一个能与登录态不一致的来源。权限由后端 COUPON_MANAGE 校验（403 归一成 ApiError）。
 */

/** 本店券模板分页列表（按创建时间倒序，由后端定） */
export async function listCoupons(
    page: number,
    size: number,
): Promise<PageResultCouponTemplateResponse> {
    return await SellerCouponsApi.listShopCoupons({ query: { pageParams: { page, size } } })
}

/** 新建券模板：金额入参是「分」，元→分的换算在 form.ts 的投影里做 */
export async function createCoupon(
    input: CreateCouponTemplateRequest,
): Promise<CouponTemplateResponse> {
    return await SellerCouponsApi.createCoupon({ body: input })
}

/** 停用券模板：只停止继续领取，已领出的券照旧可用 */
export async function stopCoupon(id: string): Promise<CouponTemplateResponse> {
    return await SellerCouponsApi.stopCoupon({ path: { id } })
}
