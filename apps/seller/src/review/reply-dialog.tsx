import { SellerReviewsApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    Field,
    FieldLabel,
    Textarea,
} from "@shop/ui-web"
import { useState } from "react"
import { NOTE_MAX } from "@shop/common"
import { reviewKeys } from "./queries"

/**
 * 回复一条评价（REV-10，只能一次）。
 *
 * 做成弹窗而不是 confirm：回复是要写字的，而回复是买家在商详页直接看到的话——
 * 「回复后不可修改」这句话必须和输入框在同一个视野里，不能藏在确认框的标题后面。
 */
export function ReviewReplyDialog({
    reviewId,
    productName,
    buyerLabel,
}: {
    reviewId: string
    productName: string
    /** 买家昵称（掩码形态，出参即如此） */
    buyerLabel: string
}) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState("")

    const reply = useMutation({
        mutationFn: () => SellerReviewsApi.replyReview({ path: { id: reviewId }, body: { text } }),
        meta: {
            success: "回复已发布",
            error: "回复失败",
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => {
            setOpen(false)
            setText("")
        },
    })

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                回复
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>回复评价</DialogTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {productName} · 买家 {buyerLabel}
                    </p>
                    <form
                        className="mt-4 flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            reply.mutate()
                        }}
                    >
                        <Field>
                            <FieldLabel>回复内容（买家在商详页会看到，只能回一次）</FieldLabel>
                            <Textarea
                                maxLength={NOTE_MAX}
                                placeholder="感谢反馈，我们会尽快改进"
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                            />
                        </Field>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                disabled={!text.trim() || reply.isPending}
                            >
                                {reply.isPending ? "发布中…" : "发布回复"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
