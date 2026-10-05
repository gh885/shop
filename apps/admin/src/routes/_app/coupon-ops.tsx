import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { useCouponColumns } from "#/coupon-ops/columns"
import { STATUS_OPTIONS } from "#/coupon-ops/constants"
import { adminCouponListOptions, couponOpsSearchSchema } from "#/coupon-ops/queries"
import { ListShell, SelectFilter, TextFilter } from "#/shared/ui/list-shell"

export const Route = createFileRoute("/_app/coupon-ops")({
    validateSearch: couponOpsSearchSchema,
    component: CouponOpsPage,
})

function CouponOpsPage() {
    const t = useT()
    const search = Route.useSearch()
    const query = useQuery(adminCouponListOptions(search))
    const columns = useCouponColumns()

    return (
        <ListShell
            title={t("admin.coupon.ops.title")}
            description={t("admin.coupon.ops.description")}
            search={search}
            query={query}
            columns={columns}
            emptyContent={t("admin.coupon.ops.empty")}
        >
            <TextFilter
                name="userId"
                label={t("admin.coupon.ops.filter.userId")}
                className="w-52"
            />
            <TextFilter
                name="shopId"
                label={t("admin.coupon.ops.filter.shopId")}
                className="w-52"
            />
            <SelectFilter
                name="status"
                label={t("admin.coupon.col.status")}
                options={localizeStatusOptions(STATUS_OPTIONS, t)}
            />
        </ListShell>
    )
}
