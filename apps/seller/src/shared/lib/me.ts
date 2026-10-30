import { SellerMeControllerApi, type SellerMe } from "@shop/api/sdk"
import { createMeQuery } from "@shop/app-kit/data"

import { useAuthStatus } from "./api"

/**
 * 卖家账号身份。
 *
 * <p>后端 `GET /api/seller/me` 一次给全：登录名、展示名、所属店铺与语言偏好。
 * 店铺 id 是每个页面都要的（运费模板按店查、商品归属按店判），而登录只回令牌——
 * 没有这个端点前端只能靠猜。
 */
const me = createMeQuery<SellerMe>({
    scope: "seller:me",
    queryFn: () => SellerMeControllerApi.sellerMe(),
    useAuthStatus,
    userIdOf: (value) => value.operatorId,
})

export const { ME_QUERY_KEY } = me

export const useMe = me.useMe

export const useClearMe = me.useClearMe
