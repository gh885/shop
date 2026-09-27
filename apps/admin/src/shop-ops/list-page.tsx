import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@shop/ui-web"
import { IdFilter } from "#/shared/ui/id-filter"
import { PagedListPage } from "#/shared/ui/paged-list-page"
import { StatusFilter } from "#/shared/ui/status-filter"
import { SHOP_STATUS_OPTIONS } from "./constants"
import { shopColumns } from "./columns"
import { type ShopOpsSearch, adminShopListOptions } from "./queries"

type Navigate = (options: { search: ShopOpsSearch }) => void

/**
 * 平台侧店铺治理：看全量店铺、按状态/关键字筛、对营业中的店封停、对已封停的店解封（ACC-60）。
 *
 * 入驻审核（首页）管的是「这店能不能开张」，本页管的是「开张的店要不要继续营业」——
 * 两件事入口不同、后果不同，所以不并进同一个队列页。
 */
export function ShopOpsPage({ search, navigate }: { search: ShopOpsSearch; navigate: Navigate }) {
    const query = useQuery(adminShopListOptions(search))

    return (
        <PagedListPage
            title="店铺治理"
            description="封停营业中的店铺（级联下架在架商品）；解封只恢复营业，不自动重上架"
            search={search}
            navigate={navigate}
            query={query}
            columns={shopColumns}
            emptyContent="没有符合条件的店铺"
            filters={
                <ShopOpsFilters
                    search={search}
                    navigate={navigate}
                />
            }
        />
    )
}

function ShopOpsFilters({ search, navigate }: { search: ShopOpsSearch; navigate: Navigate }) {
    // 关键字是本地态：只有「回车 / 点搜索」才写回 URL，避免每敲一个字符打一次接口
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    const applyKeyword = () =>
        navigate({ search: { ...search, keyword: keyword || undefined, page: 1 } })

    return (
        <>
            <StatusFilter
                value={search.status}
                options={SHOP_STATUS_OPTIONS}
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
