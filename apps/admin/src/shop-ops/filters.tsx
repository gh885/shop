import { useState } from "react"
import { Button } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { SHOP_STATUS_OPTIONS } from "./constants"
import type { ShopOpsSearch } from "./queries"
import { IdFilter } from "#/shared/ui/id-filter"
import { StatusFilter } from "#/shared/ui/status-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"

/** 店铺治理页的筛选栏：状态枚举 + 店名/店主 ID 关键字 */
export function ShopOpsFilters({
    search,
    navigate,
}: {
    search: ShopOpsSearch
    navigate: SearchNavigate<ShopOpsSearch>
}) {
    // 关键字是本地态：只有「回车 / 点搜索」才写回 URL，避免每敲一个字符打一次接口
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
                label="店名或店主 ID"
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
                搜索
            </Button>
        </>
    )
}
