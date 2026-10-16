import { useState } from "react"
import { Button } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { SHOP_STATUS_OPTIONS } from "./constants"
import type { ShopOpsSearch } from "./queries"
import { IdFilter } from "#/shared/ui/id-filter"
import { StatusFilter } from "#/shared/ui/status-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"

export function ShopOpsFilters({
    search,
    navigate,
}: {
    search: ShopOpsSearch
    navigate: SearchNavigate<ShopOpsSearch>
}) {
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    const t = useT()
    const applyKeyword = () =>
        navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })

    return (
        <>
            <StatusFilter
                value={search.status}
                options={localizeStatusOptions(SHOP_STATUS_OPTIONS, t)}
                onChange={(status) => navigate({ search: { ...search, status, page: 1 } })}
            />
            <IdFilter
                label={t("shopOps.filter.keywordLabel")}
                className="w-52"
                value={keyword}
                onChange={setKeyword}
                onSubmit={applyKeyword}
            />
            <Button
                variant="outline"
                size="sm"
                onClick={applyKeyword}
            >
                {t("ui.search.button")}
            </Button>
        </>
    )
}
