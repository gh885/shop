import { useState } from "react"
import type { StaffStatus, UserStatus } from "@shop/api/sdk"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
    DataTable,
    DataTablePagination,
    DataTableSkeleton,
    DataTableToolbar,
    DataTableViewOptions,
    Input,
    useDataTable,
    type DataTableFeatures,
} from "@shop/ui-web"
import { staffColumns, userColumns } from "./columns"
import {
    StaffStatusSchema,
    STAFF_STATUS_OPTIONS,
    UserStatusSchema,
    USER_STATUS_OPTIONS,
} from "./constants"
import { adminStaffOptions, adminUsersOptions } from "./queries"
import { StatusFilter } from "#/shared/ui/status-filter"

export interface AccountSearch {
    status?: UserStatus | StaffStatus
    keyword?: string
    page: number
    size: number
}

type AccountNavigate = (options: { search: AccountSearch }) => void
type AccountRow = { id: string }
type StatusParser = (
    value: string,
) => { success: true; data: UserStatus | StaffStatus } | { success: false }
type Pagination = { pageIndex: number; pageSize: number }
type PaginationUpdater = Pagination | ((old: Pagination) => Pagination)

export function AccountListPage(props: {
    kind: "user"
    search: AccountSearch
    navigate: AccountNavigate
}) {
    return <UserTable {...props} />
}

export function StaffListPage(props: {
    kind: "staff"
    search: AccountSearch
    navigate: AccountNavigate
}) {
    return <StaffTable {...props} />
}

function UserTable({
    search,
    navigate,
}: {
    kind: "user"
    search: AccountSearch
    navigate: AccountNavigate
}) {
    const query = useQuery(
        adminUsersOptions({
            status: search.status,
            keyword: search.keyword,
            page: search.page,
            size: search.size,
        }),
    )
    return (
        <>
            <AccountHeader kind="user" />
            <AccountTableView
                search={search}
                navigate={navigate}
                query={query}
                columns={userColumns}
                statusOptions={USER_STATUS_OPTIONS}
                parse={(value) => UserStatusSchema.safeParse(value)}
            />
        </>
    )
}

function StaffTable({
    search,
    navigate,
}: {
    kind: "staff"
    search: AccountSearch
    navigate: AccountNavigate
}) {
    const query = useQuery(
        adminStaffOptions({
            status: search.status,
            keyword: search.keyword,
            page: search.page,
            size: search.size,
        }),
    )
    return (
        <>
            <AccountHeader kind="staff" />
            <AccountTableView
                search={search}
                navigate={navigate}
                query={query}
                columns={staffColumns}
                statusOptions={STAFF_STATUS_OPTIONS}
                parse={(value) => StaffStatusSchema.safeParse(value)}
            />
        </>
    )
}

function AccountTableView<T extends AccountRow>({
    search,
    navigate,
    query,
    columns,
    statusOptions,
    parse,
}: {
    search: AccountSearch
    navigate: AccountNavigate
    query: UseQueryResult<{ records: T[]; total: number }>
    columns: ColumnDef<DataTableFeatures, T>[]
    statusOptions: typeof USER_STATUS_OPTIONS
    parse: StatusParser
}) {
    const rows = query.data?.records ?? []
    const pagination = { pageIndex: search.page - 1, pageSize: search.size }
    const { table } = useDataTable<T>({
        columns,
        data: rows,
        getRowId: (row) => row.id,
        rowCount: query.data?.total,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: { pagination },
        onPaginationChange: (updater) => updatePagination(updater, pagination, search, navigate),
    })

    return (
        <div className="space-y-4">
            <AccountFilterBar
                search={search}
                navigate={navigate}
                table={table}
                statusOptions={statusOptions}
                parse={parse}
            />
            <AccountDataTable
                query={query}
                table={table}
                columns={columns}
            />
        </div>
    )
}

function updatePagination(
    updater: PaginationUpdater,
    pagination: Pagination,
    search: AccountSearch,
    navigate: AccountNavigate,
) {
    const next = typeof updater === "function" ? updater(pagination) : updater
    navigate({ search: { ...search, page: next.pageIndex + 1, size: next.pageSize } })
}

function AccountDataTable<T extends AccountRow>({
    query,
    table,
    columns,
}: {
    query: UseQueryResult<{ records: T[]; total: number }>
    table: ReturnType<typeof useDataTable<T>>["table"]
    columns: ColumnDef<DataTableFeatures, T>[]
}) {
    if (query.isPending) return <DataTableSkeleton columns={columns.length} />
    return (
        <DataTable<T>
            table={table}
            emptyContent="暂无符合条件的账号"
            footer={<DataTablePagination<T> table={table} />}
        />
    )
}

function AccountHeader({ kind }: { kind: "user" | "staff" }) {
    return (
        <div>
            <h1 className="text-lg font-semibold">{kind === "user" ? "用户管理" : "员工管理"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
                {kind === "user" ? "查看买家账号并管理登录状态" : "查看平台员工并管理登录状态"}
            </p>
        </div>
    )
}

function AccountFilterBar<T extends AccountRow>({
    search,
    navigate,
    table,
    statusOptions,
    parse,
}: {
    search: AccountSearch
    navigate: AccountNavigate
    table: ReturnType<typeof useDataTable<T>>["table"]
    statusOptions: typeof USER_STATUS_OPTIONS
    parse: StatusParser
}) {
    return (
        <DataTableToolbar<T>
            table={table}
            actions={<DataTableViewOptions<T> table={table} />}
        >
            <AccountKeywordFilter
                search={search}
                navigate={navigate}
            />
            <AccountStatusFilter
                search={search}
                navigate={navigate}
                options={statusOptions}
                parse={parse}
            />
        </DataTableToolbar>
    )
}

function AccountKeywordFilter({
    search,
    navigate,
}: {
    search: AccountSearch
    navigate: AccountNavigate
}) {
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    return (
        <Input
            aria-label="搜索账号"
            placeholder="搜索账号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })
                }
            }}
            className="w-56"
        />
    )
}

function AccountStatusFilter({
    search,
    navigate,
    options,
    parse,
}: {
    search: AccountSearch
    navigate: AccountNavigate
    options: typeof USER_STATUS_OPTIONS
    parse: (value: string) => { success: true; data: UserStatus } | { success: false }
}) {
    return (
        <StatusFilter
            value={search.status}
            options={options}
            onChange={(value) => {
                const status = parse(value ?? "all")
                navigate({
                    search: {
                        ...search,
                        status: status.success ? status.data : undefined,
                        page: 1,
                    },
                })
            }}
        />
    )
}
