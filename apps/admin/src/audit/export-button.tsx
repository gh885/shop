import { message } from "#/locales/message"
import { AdminAuditsApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { downloadAuditCsv } from "./export"
import { AUDIT_PAGE_SIZE, EXPORT_ROW_LIMIT } from "./constants"
import { auditFilterParams, type AuditSearch } from "./queries"

// 二次确认挡的是「我导了筛选条件之外的东西」：确认框里把范围与条数写清楚，人是在看清导的是什么之后点的
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
                    t("audit.export.overLimit", {
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
        meta: { error: message("audit.export.failed") },
    })

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() =>
                void confirm({
                    title: t("audit.export.dialogTitle"),
                    description: t("audit.export.dialogDescription", {
                        limit: EXPORT_ROW_LIMIT,
                    }),
                    confirmText: t("audit.export.confirm"),
                    action: exportMutation.mutateAsync,
                })
            }
        >
            {t("audit.export.action")}
        </Button>
    )
}
