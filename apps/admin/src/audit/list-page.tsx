import { useState } from "react"
import { AdminAuditsApi } from "@shop/api/sdk"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button, Input, confirm } from "@shop/ui-web"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"
import { IdFilter } from "#/shared/ui/id-filter"
import { PagedListPage } from "#/shared/ui/paged-list-page"
import { StatusFilter } from "#/shared/ui/status-filter"
import { auditColumns } from "./columns"
import { ACTION_OPTIONS, AUDIT_PAGE_SIZE, EXPORT_ROW_LIMIT, TARGET_OPTIONS } from "./constants"
import { downloadAuditCsv } from "./export"
import { type AuditSearch, auditListOptions } from "./queries"

type Navigate = (options: { search: AuditSearch }) => void

/**
 * 操作审计查询页：按操作人 / 对象 / 时间窗反查治理账本。
 *
 * 页面只管三件事：取数、把 URL 状态与筛选写回、把「导出」做成一次带二次确认的动作。
 * 列与文案在 `columns.tsx` / `constants.ts`，CSV 拼装在 `export.ts`——本文件里没有业务判定。
 */
export function AuditPage({ search, navigate }: { search: AuditSearch; navigate: Navigate }) {
    const query = useQuery(auditListOptions(search))

    return (
        <PagedListPage
            title="操作审计"
            description="封号、作废券、审核、封店、员工调权的统一留痕；敏感字段只落掩码"
            search={search}
            navigate={navigate}
            query={query}
            columns={auditColumns}
            emptyContent="该条件下没有审计记录"
            filters={
                <AuditFilters
                    search={search}
                    navigate={navigate}
                />
            }
            toolbarActions={<ExportButton search={search} />}
        />
    )
}

function AuditFilters({ search, navigate }: { search: AuditSearch; navigate: Navigate }) {
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

/**
 * 导出：一次带二次确认的动作。
 *
 * 为什么必须二次确认：审计是追责材料，导出意味着这批记录离开系统被复制走，
 * 而「我导了筛选条件之外的东西」这种误会只有一次显式确认能挡。确认框里把范围与条数写清楚——
 * 人是在看清「导的是什么」之后点的，不是在看清一个叫「导出」的按钮之后点的。
 *
 * 走 mutation 而不是 confirm 里裸调接口：失败提示由全局 MutationCache 统一出（不重复弹 toast），
 * 成功则 confirm 关窗；超上限这类「不是错误但要人处理」的情况按错误出文案。
 */
function ExportButton({ search }: { search: AuditSearch }) {
    const exportMutation = useMutation({
        mutationFn: async () => {
            const query = exportQuery(search)
            const first = await AdminAuditsApi.listAuditRecords({
                query: { pageParams: { page: 1, size: AUDIT_PAGE_SIZE }, query },
            })
            if (first.total > EXPORT_ROW_LIMIT) {
                throw new Error(
                    `该条件下共 ${first.total} 条，超过单次导出上限 ${EXPORT_ROW_LIMIT} 条，请收窄筛选条件`,
                )
            }
            const pages = Math.ceil(first.total / AUDIT_PAGE_SIZE)
            const tail =
                pages > 1
                    ? await Promise.all(
                          Array.from({ length: pages - 1 }, (_, index) =>
                              AdminAuditsApi.listAuditRecords({
                                  query: {
                                      pageParams: { page: index + 2, size: AUDIT_PAGE_SIZE },
                                      query,
                                  },
                              }),
                          ),
                      )
                    : []
            downloadAuditCsv([...first.records, ...tail.flatMap((page) => page.records)])
        },
        meta: { error: "导出审计记录失败" },
    })

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() =>
                void confirm({
                    title: "导出审计记录",
                    description: `将按当前筛选条件导出 CSV（单次最多 ${EXPORT_ROW_LIMIT} 条）。导出文件会离开本系统，请确认导出范围。`,
                    confirmText: "确认导出",
                    action: exportMutation.mutateAsync,
                })
            }
        >
            导出
        </Button>
    )
}

/** 导出与列表同口径的筛选参数（两处各写一遍就会「导出的和看到的不一样」） */
function exportQuery(search: AuditSearch) {
    return {
        operatorId: search.operatorId,
        targetType: search.targetType,
        targetId: search.targetId,
        action: search.action,
        from: search.from,
        to: search.to,
    }
}
