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

/**
 * 结单动作：一张异常单 = 一件已经联系过/跟进过的事，备注是给下一班人看的现场记录。
 *
 * 做成带备注的弹窗而不是一键「已处理」：结单后这张单不再出现在待办里，备注是它唯一留下的现场痕迹
 * （LOG-33 的待办口径：假待办比没待办更伤，所以处理完必须留下一句「怎么处理的」）。
 *
 * 备注由裸 useState 迁到 useAppForm，为的是让后端 422 那句「最长 N 字」落在这个 textarea 上，
 * 而不是只剩一句 toast。交互形状不变：留空仍可结单（请求体不塞空 note），成功后收起弹窗并清空草稿。
 */
export function IssueResolveAction({ issue }: { issue: ShipmentIssueResponse }) {
    const t = useT()
    const [open, setOpen] = useState(false)

    const resolve = useMutation({
        mutationFn: (note: string) =>
            AdminLogisticsApi.resolveIssue({
                path: { id: issue.id },
                body: { note: note.trim() || undefined },
            }),
        meta: {
            success: message("admin.logistics.resolve.done"),
            error: message("admin.logistics.resolve.failed"),
            invalidates: [logisticsKeys.openIssues],
        },
    })

    const form = useAppForm({
        defaultValues: { note: "" },
        onSubmit: async ({ value }) => {
            try {
                await resolve.mutateAsync(value.note)
            } catch (error) {
                // ResolveIssueRequest 只有 note 一格（@Size 上限镜像 NOTE_MAX），与表单同名。
                // 上限由 textarea 的 maxLength 先把着，所以这条通道平时是空的；平时为空不等于不接
                applyServerFieldErrors(form, serverFieldErrors(error, { note: "note" }))
                throw error
            }
            setOpen(false)
            form.reset()
        },
    })

    // 类型名与「无补充说明」都按当前语言取：这两句都是给运维看的第一眼信息
    const typeMeta = ISSUE_TYPE_LABEL[issue.type]
    const typeLabel = typeMeta ? t(typeMeta.labelKey) : issue.type
    const summary = t("admin.logistics.resolve.summary", {
        type: typeLabel,
        detail: issue.detail ?? t("admin.logistics.resolve.noDetail"),
    })

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                {t("admin.logistics.resolve.action")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            // 不写 void form.handleSubmit()：catch 里 rethrow 的那条会变成未处理的异步异常
                            void submitForm(form)
                        }}
                    >
                        <DialogTitle>{t("admin.logistics.resolve.dialogTitle")}</DialogTitle>
                        <p className="text-sm text-muted-foreground">{summary}</p>
                        <form.AppField name="note">
                            {(field) => (
                                <field.TextareaField
                                    label={t("admin.logistics.resolve.noteLabel")}
                                    maxLength={NOTE_MAX}
                                    placeholder={t("admin.logistics.resolve.notePlaceholder")}
                                />
                            )}
                        </form.AppField>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                            >
                                {t("common.action.cancel")}
                            </Button>
                            <Button
                                type="submit"
                                disabled={resolve.isPending}
                            >
                                {resolve.isPending
                                    ? t("admin.logistics.resolve.submitting")
                                    : t("admin.logistics.resolve.submit")}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
