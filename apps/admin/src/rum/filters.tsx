import { useState } from "react"
import { Button, Input } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"
import { APP_OPTIONS, KIND_OPTIONS } from "./constants"
import type { RumIssueSearch } from "./queries"

/**
 * 问题列表的筛选栏：上报端 / 事件类型 / 时间窗。
 *
 * 没有「关键字」这一格是刻意的：摘要与路由是客户端给的自由文本，后端没为它们建索引，
 * 拿它做 LIKE 就是把一次列表翻页变成全表扫。要按路由收窄，去明细页（那里有路由筛）。
 *
 * 时间窗是**本地草稿**、点「应用筛选」才写回 URL；两个枚举是「选中即提交」——
 * 与审计页同一口径，也和外壳的 `draftKeys` 对得上。
 */
export function RumIssueFilters({
    search,
    navigate,
}: {
    search: RumIssueSearch
    navigate: SearchNavigate<RumIssueSearch>
}) {
    const t = useT()
    const [from, setFrom] = useState(toDateTimeLocal(search.from))
    const [to, setTo] = useState(toDateTimeLocal(search.to))

    const applyFilters = () =>
        navigate({
            search: {
                ...search,
                from: fromDateTimeLocal(from),
                to: fromDateTimeLocal(to),
                page: 1,
            },
        })

    return (
        <>
            <StatusFilter
                label={t("rum.field.app")}
                value={search.app}
                options={localizeStatusOptions(APP_OPTIONS, t)}
                onChange={(app) => navigate({ search: { ...search, app, page: 1 } })}
            />
            <StatusFilter
                label={t("rum.field.kind")}
                value={search.kind}
                options={localizeStatusOptions(KIND_OPTIONS, t)}
                onChange={(kind) => navigate({ search: { ...search, kind, page: 1 } })}
            />
            <Input
                aria-label={t("rum.filter.from")}
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-52"
            />
            <Input
                aria-label={t("rum.filter.to")}
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-52"
            />
            <Button
                variant="outline"
                size="sm"
                onClick={applyFilters}
            >
                {t("rum.filter.apply")}
            </Button>
        </>
    )
}
