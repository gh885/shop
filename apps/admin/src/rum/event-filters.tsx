import { useState } from "react"
import { Button } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import { IdFilter } from "#/shared/ui/id-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"
import { APP_OPTIONS } from "./constants"
import type { RumEventSearch } from "./queries"
import { TimeRangeInputs } from "./time-range-inputs"

/**
 * 明细列表的筛选栏。
 *
 * 指纹那一格是**可编辑的输入框**而不是只读标签：它从问题列表点进来时带着值，
 * 但排查常常要「换个指纹看看」或「把这格清掉看全部」，只读标签会把这两件事都堵死。
 * 它是草稿 + 回车/「应用筛选」才写回 URL，所以清空后必须点一下才会真的放宽范围。
 */
export function RumEventFilters({
    search,
    navigate,
}: {
    search: RumEventSearch
    navigate: SearchNavigate<RumEventSearch>
}) {
    const t = useT()
    const [fingerprint, setFingerprint] = useState(search.fingerprint ?? "")
    const [route, setRoute] = useState(search.route ?? "")
    const [from, setFrom] = useState(toDateTimeLocal(search.from))
    const [to, setTo] = useState(toDateTimeLocal(search.to))

    const applyFilters = () =>
        navigate({
            search: {
                ...search,
                fingerprint: fingerprint || undefined,
                route: route || undefined,
                from: fromDateTimeLocal(from),
                to: fromDateTimeLocal(to),
                page: 1,
            },
        })

    return (
        <>
            <IdFilter
                label={t("rum.filter.fingerprint")}
                value={fingerprint}
                onChange={setFingerprint}
                onSubmit={applyFilters}
                className="w-64"
            />
            <StatusFilter
                label={t("rum.field.app")}
                value={search.app}
                options={localizeStatusOptions(APP_OPTIONS, t)}
                onChange={(app) => navigate({ search: { ...search, app, page: 1 } })}
            />
            <IdFilter
                label={t("rum.filter.route")}
                value={route}
                onChange={setRoute}
                onSubmit={applyFilters}
                className="w-52"
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
