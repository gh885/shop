import { useState } from "react"
import { AdminLogisticsApi, type ShipmentIssueResponse } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Field,
    FieldLabel,
    Textarea,
} from "@shop/ui-web"
import { NOTE_MAX } from "@shop/common"
import { ISSUE_TYPE_LABEL } from "./constants"
import { logisticsKeys } from "./queries"

/**
 * 结单动作：一张异常单 = 一件已经联系过/跟进过的事，备注是给下一班人看的现场记录。
 *
 * 做成带备注的弹窗而不是一键「已处理」：结单后这张单不再出现在待办里，备注是它唯一留下的现场痕迹
 * （LOG-33 的待办口径：假待办比没待办更伤，所以处理完必须留下一句「怎么处理的」）。
 */
export function IssueResolveAction({ issue }: { issue: ShipmentIssueResponse }) {
    const [open, setOpen] = useState(false)
    const [note, setNote] = useState("")

    const resolve = useMutation({
        mutationFn: () =>
            AdminLogisticsApi.resolveIssue({
                path: { id: issue.id },
                body: { note: note.trim() || undefined },
            }),
        meta: {
            success: "异常单已处置",
            error: "处置失败",
            invalidates: [logisticsKeys.openIssues],
        },
        onSuccess: () => {
            setOpen(false)
            setNote("")
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
                            resolve.mutate()
                        }}
                    >
                        <DialogTitle>处置物流异常</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                            {label}：{issue.detail ?? "无补充说明"}
                        </p>
                        <Field>
                            <FieldLabel>处置备注（给下一班人看，可留空）</FieldLabel>
                            <Textarea
                                maxLength={NOTE_MAX}
                                placeholder="已电话催件，承运商承诺明早派送"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                            />
                        </Field>
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
