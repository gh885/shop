import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { IdFilter } from "#/shared/ui/id-filter"
import { PagedListPage } from "#/shared/ui/paged-list-page"
import { StatusFilter } from "#/shared/ui/status-filter"
import { type AdminCouponStatus, CouponStatusSchema, STATUS_OPTIONS } from "./constants"
import { adminCouponListOptions } from "./queries"
import { couponColumns } from "./columns"

type Search = {
    userId?: string
    shopId?: string
    status?: AdminCouponStatus
    page: number
    size: number
}
type Navigate = (options: { search: Search }) => void

export function CouponOpsPage({ search, navigate }: { search: Search; navigate: Navigate }) {
    const query = useQuery(adminCouponListOptions(search))

    return (
        <PagedListPage
            title="优惠券运营"
            description="查询用户持有的优惠券并处理未使用券"
            search={search}
            navigate={navigate}
            query={query}
            columns={couponColumns}
            emptyContent="暂无符合条件的优惠券"
            filters={
                <CouponFilters
                    search={search}
                    navigate={navigate}
                />
            }
        />
    )
}

function CouponFilters({ search, navigate }: { search: Search; navigate: Navigate }) {
    const [userId, setUserId] = useState(search.userId ?? "")
    const [shopId, setShopId] = useState(search.shopId ?? "")
    const applyFilters = () =>
        navigate({
            search: {
                ...search,
                userId: userId || undefined,
                shopId: shopId || undefined,
                page: 1,
            },
        })

    return (
        <>
            <IdFilter
                label="持券人 ID"
                className="w-52"
                value={userId}
                onChange={setUserId}
                onSubmit={applyFilters}
            />
            <IdFilter
                label="店铺 ID"
                className="w-52"
                value={shopId}
                onChange={setShopId}
                onSubmit={applyFilters}
            />
            <StatusFilter
                value={search.status}
                options={STATUS_OPTIONS}
                onChange={(value) => {
                    const status = CouponStatusSchema.safeParse(value)
                    navigate({
                        search: {
                            ...search,
                            status: status.success ? status.data : undefined,
                            page: 1,
                        },
                    })
                }}
            />
        </>
    )
}
