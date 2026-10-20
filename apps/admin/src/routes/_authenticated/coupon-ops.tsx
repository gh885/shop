import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { useCouponColumns } from "#/domains/coupon-ops/columns"
import { STATUS_OPTIONS } from "#/domains/coupon-ops/constants"
import { adminCouponListOptions } from "#/domains/coupon-ops/queries"
import { couponOpsSearchSchema } from "#/domains/coupon-ops/search"
import { ListShell, SelectFilter, TextFilter } from "#/shared/ui/list-shell"

export const Route = createFileRoute("/_authenticated/coupon-ops")({
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
            title={t("coupon.ops.title")}
            description={t("coupon.ops.description")}
            search={search}
            query={query}
            columns={columns}
            emptyContent={t("coupon.ops.empty")}
        >
            <TextFilter
                name="userId"
                label={t("coupon.ops.filter.userId")}
                className="w-52"
            />
            <TextFilter
                name="shopId"
                label={t("coupon.ops.filter.shopId")}
                className="w-52"
            />
            <SelectFilter
                name="status"
                label={t("coupon.col.status")}
                options={localizeStatusOptions(STATUS_OPTIONS, t)}
            />
        </ListShell>
    )
}
