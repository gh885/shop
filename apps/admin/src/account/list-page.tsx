import { useState } from "react"
import type { StatusOption } from "@shop/common"
import { useQuery } from "@tanstack/react-query"
import { staffColumns, userColumns } from "./columns"
import { STAFF_STATUS_OPTIONS, USER_STATUS_OPTIONS } from "./constants"
import { type StaffSearch, type UserSearch, adminStaffOptions, adminUsersOptions } from "./queries"
import { IdFilter } from "#/shared/ui/id-filter"
import { PagedListPage } from "#/shared/ui/paged-list-page"
import { StatusFilter } from "#/shared/ui/status-filter"
import { StaffCreateDialog } from "./staff-create-dialog"

type Navigate<S> = (options: { search: S }) => void

export function UserListPage({
    search,
    navigate,
}: {
    search: UserSearch
    navigate: Navigate<UserSearch>
}) {
    const query = useQuery(adminUsersOptions(search))
    return (
        <PagedListPage
            title="用户管理"
            description="查看买家账号并管理登录状态"
            search={search}
            navigate={navigate}
            query={query}
            columns={userColumns}
            emptyContent="暂无符合条件的账号"
            filters={
                <AccountFilters
                    search={search}
                    navigate={navigate}
                    options={USER_STATUS_OPTIONS}
                />
            }
        />
    )
}

export function StaffListPage({
    search,
    navigate,
}: {
    search: StaffSearch
    navigate: Navigate<StaffSearch>
}) {
    const query = useQuery(adminStaffOptions(search))
    return (
        <PagedListPage
            title="员工管理"
            description="创建平台员工、调整岗位与管理登录状态"
            actions={<StaffCreateDialog />}
            search={search}
            navigate={navigate}
            query={query}
            columns={staffColumns}
            emptyContent="暂无符合条件的账号"
            filters={
                <AccountFilters
                    search={search}
                    navigate={navigate}
                    options={STAFF_STATUS_OPTIONS}
                />
            }
        />
    )
}

function AccountFilters<
    S extends { status?: T; keyword?: string; page: number },
    T extends string,
>({
    search,
    navigate,
    options,
}: {
    search: S
    navigate: Navigate<S>
    options: readonly StatusOption<T>[]
}) {
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    return (
        <>
            <IdFilter
                label="搜索账号"
                className="w-56"
                value={keyword}
                onChange={setKeyword}
                onSubmit={() =>
                    navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })
                }
            />
            <StatusFilter
                value={search.status}
                options={options}
                onChange={(status) => navigate({ search: { ...search, status, page: 1 } })}
            />
        </>
    )
}
