import { useState } from "react"
import type { StatusOption } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { IdFilter } from "#/shared/ui/id-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"

/**
 * 账号两张列表共用的筛选栏（买家 / 员工只差状态枚举）：关键字 + 状态。
 *
 * 关键字是本地草稿，只有回车或点搜索才写回 URL——每敲一个字符打一次接口没意义。
 */
export function AccountFilters<
    S extends { status?: T; keyword?: string; page: number },
    T extends string,
>({
    search,
    navigate,
    options,
}: {
    search: S
    navigate: SearchNavigate<S>
    options: readonly StatusOption<T>[]
}) {
    const t = useT()
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    return (
        <>
            <IdFilter
                label={t("admin.account.filter.keyword")}
                className="w-56"
                value={keyword}
                onChange={setKeyword}
                onSubmit={() =>
                    navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })
                }
            />
            <StatusFilter
                label={t("admin.account.col.status")}
                value={search.status}
                options={options}
                onChange={(status) => navigate({ search: { ...search, status, page: 1 } })}
            />
        </>
    )
}
