import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { couponColumns } from "#/coupon-ops/columns"
import { STATUS_OPTIONS } from "#/coupon-ops/constants"
import { adminCouponListOptions, couponOpsSearchSchema } from "#/coupon-ops/queries"
import { ListPage, SelectFilter, TextFilter } from "#/shared/ui/list-page"

export const Route = createFileRoute("/_app/coupon-ops")({
    validateSearch: couponOpsSearchSchema,
    component: CouponOpsPage,
})

function CouponOpsPage() {
    const search = Route.useSearch()
    const query = useQuery(adminCouponListOptions(search))

    return (
        <ListPage
            title="优惠券运营"
            description="查询用户持有的优惠券并处理未使用券"
            search={search}
            query={query}
            columns={couponColumns}
            emptyContent="暂无符合条件的优惠券"
        >
            <TextFilter
                name="userId"
                label="持券人 ID"
                className="w-52"
            />
            <TextFilter
                name="shopId"
                label="店铺 ID"
                className="w-52"
            />
            <SelectFilter
                name="status"
                options={STATUS_OPTIONS}
            />
        </ListPage>
    )
}
