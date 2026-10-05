import { message } from "#/locales/message"
import { AdminAuditsApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { downloadAuditCsv } from "./export"
import { AUDIT_PAGE_SIZE, EXPORT_ROW_LIMIT } from "./constants"
import { auditFilterParams, type AuditSearch } from "./queries"

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
export function ExportButton({ search }: { search: AuditSearch }) {
    const { locale } = useI18n()
    const t = useT()
    const exportMutation = useMutation({
        mutationFn: async () => {
            const query = auditFilterParams(search)
            const first = await AdminAuditsApi.listAuditRecords({
                query: { pageParams: { page: 1, size: AUDIT_PAGE_SIZE }, query },
            })
            if (first.total > EXPORT_ROW_LIMIT) {
                throw new Error(
                    t("admin.audit.export.overLimit", {
                        total: first.total,
                        limit: EXPORT_ROW_LIMIT,
                    }),
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
            downloadAuditCsv([...first.records, ...tail.flatMap((page) => page.records)], locale, t)
        },
        meta: { error: message("admin.audit.export.failed") },
    })

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() =>
                void confirm({
                    title: t("admin.audit.export.dialogTitle"),
                    description: t("admin.audit.export.dialogDescription", {
                        limit: EXPORT_ROW_LIMIT,
                    }),
                    confirmText: t("admin.audit.export.confirm"),
                    action: exportMutation.mutateAsync,
                })
            }
        >
            {t("admin.audit.export.action")}
        </Button>
    )
}
