import { useState } from "react"
import { Button } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"
import { APP_OPTIONS, KIND_OPTIONS } from "./constants"
import type { RumIssueSearch } from "./queries"
import { TimeRangeInputs } from "./time-range-inputs"

// 没有关键字格是刻意的：摘要/路由是客户端自由文本、后端没建索引，拿它做 LIKE 就是把列表翻页变成全表扫
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
            <TimeRangeInputs
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
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
