import { useState } from "react"
import type { StatusOption } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { IdFilter } from "#/shared/ui/id-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"

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
                label={t("account.filter.keyword")}
                className="w-56"
                value={keyword}
                onChange={setKeyword}
                onSubmit={() =>
                    navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })
                }
            />
            <StatusFilter
                label={t("account.col.status")}
                value={search.status}
                options={options}
                onChange={(status) => navigate({ search: { ...search, status, page: 1 } })}
            />
        </>
    )
}
