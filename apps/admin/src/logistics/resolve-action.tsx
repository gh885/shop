import { useState } from "react"
import { AdminLogisticsApi, type ShipmentIssueResponse } from "@shop/api/sdk"
import { serverFieldErrorTexts, submitForm, useI18n } from "@shop/app-kit"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { NOTE_MAX } from "@shop/common"
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
    const [open, setOpen] = useState(false)
    const { locale } = useI18n()

    const resolve = useMutation({
        mutationFn: (note: string) =>
            AdminLogisticsApi.resolveIssue({
                path: { id: issue.id },
                body: { note: note.trim() || undefined },
            }),
        meta: {
            success: "异常单已处置",
            error: "处置失败",
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
                applyServerFieldErrors(form, serverFieldErrorTexts(error, locale, { note: "note" }))
                throw error
            }
            setOpen(false)
            form.reset()
        },
    })

    const label = ISSUE_TYPE_LABEL[issue.type]?.label ?? issue.type

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                处置
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
                        <DialogTitle>处置物流异常</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                            {label}：{issue.detail ?? "无补充说明"}
                        </p>
                        <form.AppField name="note">
                            {(field) => (
                                <field.TextareaField
                                    label="处置备注（给下一班人看，可留空）"
                                    maxLength={NOTE_MAX}
                                    placeholder="已电话催件，承运商承诺明早派送"
                                />
                            )}
                        </form.AppField>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                disabled={resolve.isPending}
                            >
                                {resolve.isPending ? "处置中…" : "确认处置"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
