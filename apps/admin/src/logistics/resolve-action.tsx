import { message } from "#/locales/message"
import { useState } from "react"
import { AdminLogisticsApi, type ShipmentIssueResponse } from "@shop/api/sdk"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { NOTE_MAX } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { ISSUE_TYPE_LABEL } from "./constants"
import { logisticsKeys } from "./queries"

// mutation 与表单实例都关在 ResolveForm 内：DialogContent 关闭即卸载，上次写一半又关掉的备注不该跟着进下一张单
export function IssueResolveAction({ issue }: { issue: ShipmentIssueResponse }) {
    const t = useT()
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                {t("logistics.resolve.action")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <ResolveForm
                        issue={issue}
                        onOpenChange={setOpen}
                    />
                </DialogContent>
            </Dialog>
        </>
    )
}

function ResolveForm({
    issue,
    onOpenChange,
}: {
    issue: ShipmentIssueResponse
    onOpenChange: (open: boolean) => void
}) {
    const t = useT()

    const resolve = useMutation({
        mutationFn: (note: string) =>
            AdminLogisticsApi.resolveIssue({
                path: { id: issue.id },
                body: { note: note.trim() || undefined },
            }),
        meta: {
            success: message("logistics.resolve.done"),
            error: message("logistics.resolve.failed"),
            invalidates: [logisticsKeys.openIssues],
        },
    })

    const form = useAppForm({
        defaultValues: { note: "" },
        onSubmit: async ({ value }) => {
            try {
                await resolve.mutateAsync(value.note)
            } catch (error) {
                // note 的 422 字段级明细落在这格 textarea（@Size 上限镜像 NOTE_MAX），别退化成只剩一句 toast
                applyServerFieldErrors(form, serverFieldErrors(error, { note: "note" }))
                throw error
            }
            // 关窗即卸载、卸载即重置：不需要（也不该）再写 form.reset()
            onOpenChange(false)
        },
    })

    const typeMeta = ISSUE_TYPE_LABEL[issue.type]
    const typeLabel = typeMeta ? t(typeMeta.labelKey) : issue.type
    const summary = t("logistics.resolve.summary", {
        type: typeLabel,
        detail: issue.detail ?? t("logistics.resolve.noDetail"),
    })

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault()
                // 不写 void form.handleSubmit()：catch 里 rethrow 的那条会变成未处理的异步异常
                void submitForm(form)
            }}
        >
            <DialogTitle>{t("logistics.resolve.dialogTitle")}</DialogTitle>
            <p className="text-sm text-muted-foreground">{summary}</p>
            <form.AppField name="note">
                {(field) => (
                    <field.TextareaField
                        label={t("logistics.resolve.noteLabel")}
                        maxLength={NOTE_MAX}
                        placeholder={t("logistics.resolve.notePlaceholder")}
                    />
                )}
            </form.AppField>
            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                >
                    {t("common.action.cancel")}
                </Button>
                <Button
                    type="submit"
                    disabled={resolve.isPending}
                >
                    {resolve.isPending
                        ? t("logistics.resolve.submitting")
                        : t("logistics.resolve.submit")}
                </Button>
            </div>
        </form>
    )
}
