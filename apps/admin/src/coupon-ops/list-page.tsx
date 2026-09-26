import { useState } from "react"
import type { AdminCouponItem } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import type { ReactTable } from "@tanstack/react-table"
import {
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    Input,
    type DataTableFeatures,
} from "@shop/ui-web"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"
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
    const table = usePagedTable({
        columns: couponColumns,
        rows: query.data?.records ?? [],
        total: query.data?.total,
        page: search.page,
        size: search.size,
        onPageChange: (page, size) => navigate({ search: { ...search, page, size } }),
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">优惠券运营</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    查询用户持有的优惠券并处理未使用券
                </p>
            </div>
            {/* DataTable 只提供表格上下文（不渲染 DOM），筛选栏与表卡都挂在它里面：
                reui 的列显隐与分页条读 provider，放到外面就渲染不出来 */}
            <DataTable
                table={table}
                emptyContent="暂无符合条件的优惠券"
            >
                <CouponFilters
                    search={search}
                    navigate={navigate}
                    table={table}
                />
                <ListBody
                    isPending={query.isPending}
                    columns={couponColumns.length}
                />
            </DataTable>
        </div>
    )
}

function CouponFilters({
    search,
    navigate,
    table,
}: {
    search: Search
    navigate: Navigate
    table: ReactTable<DataTableFeatures, AdminCouponItem>
}) {
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
        <DataTableToolbar
            table={table}
            actions={<DataTableViewOptions table={table} />}
        >
            <IdFilter
                label="持券人 ID"
                value={userId}
                onChange={setUserId}
                onSubmit={applyFilters}
            />
            <IdFilter
                label="店铺 ID"
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
        </DataTableToolbar>
    )
}

function IdFilter({
    label,
    value,
    onChange,
    onSubmit,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
}) {
    return (
        <Input
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) onSubmit()
            }}
            className="w-52"
        />
    )
}
