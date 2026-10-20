import { useState } from "react"
import { Button, Input } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import { IdFilter } from "#/shared/ui/id-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"
import { ACTION_OPTIONS, TARGET_OPTIONS } from "./constants"
import type { AuditSearch } from "./search"

export function AuditFilters({
    search,
    navigate,
}: {
    search: AuditSearch
    navigate: SearchNavigate<AuditSearch>
}) {
    // 筛选输入是本地草稿，只有「应用筛选/回车」才写回 URL：否则每敲一个字符打一次接口
    const t = useT()
    const [operatorId, setOperatorId] = useState(search.operatorId ?? "")
    const [targetId, setTargetId] = useState(search.targetId ?? "")
    const [from, setFrom] = useState(toDateTimeLocal(search.from))
    const [to, setTo] = useState(toDateTimeLocal(search.to))

    const applyFilters = () =>
        navigate({
            search: {
                ...search,
                operatorId: operatorId || undefined,
                targetId: targetId || undefined,
                from: fromDateTimeLocal(from),
                to: fromDateTimeLocal(to),
                page: 1,
            },
        })

    return (
        <>
            <StatusFilter
                label={t("audit.field.action")}
                value={search.action}
                options={localizeStatusOptions(ACTION_OPTIONS, t)}
                onChange={(action) => navigate({ search: { ...search, action, page: 1 } })}
            />
            <StatusFilter
                label={t("audit.field.targetType")}
                value={search.targetType}
                options={localizeStatusOptions(TARGET_OPTIONS, t)}
                onChange={(targetType) => navigate({ search: { ...search, targetType, page: 1 } })}
            />
            <IdFilter
                label={t("audit.filter.operatorId")}
                value={operatorId}
                onChange={setOperatorId}
                onSubmit={applyFilters}
            />
            <IdFilter
                label={t("audit.filter.targetId")}
                value={targetId}
                onChange={setTargetId}
                onSubmit={applyFilters}
            />
            <Input
                aria-label={t("audit.filter.from")}
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-52"
            />
            <Input
                aria-label={t("audit.filter.to")}
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
                {t("audit.filter.apply")}
            </Button>
        </>
    )
}
