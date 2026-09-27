import { useState } from "react"
import { Button, Input } from "@shop/ui-web"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import { IdFilter } from "#/shared/ui/id-filter"
import type { SearchNavigate } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"
import { ACTION_OPTIONS, TARGET_OPTIONS } from "./constants"
import type { AuditSearch } from "./queries"

/** 审计页的筛选栏：动作 / 对象类型两个枚举 + 操作人 ID、对象 ID、时间窗 */
export function AuditFilters({
    search,
    navigate,
}: {
    search: AuditSearch
    navigate: SearchNavigate<AuditSearch>
}) {
    // 筛选输入是本地态：只有「应用筛选 / 回车」才写回 URL（与券运营页同一口径，避免每敲一个字符打一次接口）
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
                label="动作"
                value={search.action}
                options={ACTION_OPTIONS}
                onChange={(action) => navigate({ search: { ...search, action, page: 1 } })}
            />
            <StatusFilter
                label="对象类型"
                value={search.targetType}
                options={TARGET_OPTIONS}
                onChange={(targetType) => navigate({ search: { ...search, targetType, page: 1 } })}
            />
            <IdFilter
                label="操作人 ID"
                value={operatorId}
                onChange={setOperatorId}
                onSubmit={applyFilters}
            />
            <IdFilter
                label="对象 ID"
                value={targetId}
                onChange={setTargetId}
                onSubmit={applyFilters}
            />
            <Input
                aria-label="开始时间"
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-52"
            />
            <Input
                aria-label="结束时间"
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
                应用筛选
            </Button>
        </>
    )
}
