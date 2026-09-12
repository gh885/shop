import { createFileRoute } from "@tanstack/react-router"

import { CouponPage, couponListSearchSchema, type CouponListSearch } from "#/coupon"

/**
 * 优惠券管理（/marketing/coupon）。
 *
 * 静态路由优先于捕获两段路径的 `$group/$leaf` 占位路由，所以这个文件一建，
 * 侧边栏「营销 → 优惠券」就不再落到 PlaceholderPage。路由保持薄：校验 search 后交给域组件。
 */
export const Route = createFileRoute("/_app/marketing/coupon")({
    validateSearch: (search: Record<string, unknown>): CouponListSearch =>
        couponListSearchSchema.parse(search),
    component: CouponRoute,
})

function CouponRoute() {
    const search = Route.useSearch()
    return <CouponPage search={search} />
}
