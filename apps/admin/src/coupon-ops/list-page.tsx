import { useState } from "react"
import type { AdminCouponItem } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import type { ReactTable } from "@tanstack/react-table"
import {
    DataTableToolbar,
    DataTableViewOptions,
    Input,
    useDataTable,
    type DataTableFeatures,
} from "@shop/ui-web"
import { DataTableState } from "#/shared/ui/data-table-state"
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
    const pagination = { pageIndex: search.page - 1, pageSize: search.size }
    const { table } = useDataTable({
        columns: couponColumns,
        data: query.data?.records ?? [],
        getRowId: (row) => row.id,
        rowCount: query.data?.total,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: { pagination },
        onPaginationChange: (updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater
            void navigate({ search: { ...search, page: next.pageIndex + 1, size: next.pageSize } })
        },
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">优惠券运营</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    查询用户持有的优惠券并处理未使用券
                </p>
            </div>
            <CouponFilters
                search={search}
                navigate={navigate}
                table={table}
            />
            <DataTableState<AdminCouponItem>
                isPending={query.isPending}
                columns={couponColumns.length}
                table={table}
                emptyContent="暂无符合条件的优惠券"
            />
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
