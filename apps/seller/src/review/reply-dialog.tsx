import { SellerReviewsApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"

import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { VALIDATION_RULES } from "@shop/common/contract"
import { NOTE_MAX, withMaxLength } from "@shop/common/domain"
import {
    applyServerFieldErrors,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import { useState } from "react"

import { reviewKeys } from "./queries"

/**
 * 回复正文的规则与后端同一把尺（`ReplyReviewRequest.text` = `@NotBlank @Size(max = FREE_TEXT_MAX)`）。
 * 消息也同一把：必填与上限复用 `validation.*`——与 422 对同两条注解出的是同一句话（§6.1），
 * 上限作为 `{max}` 数据出，改 `NOTE_MAX` 时前端零改动。
 */
const ReplySchema = z.object({
    text: withMaxLength(z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }), NOTE_MAX),
})

/**
 * 回复一条评价（REV-10，只能一次）。
 *
 * 做成弹窗而不是 confirm：回复是要写字的，而回复是买家在商详页直接看到的话——
 * 「回复后不可修改」这句话必须和输入框在同一个视野里，不能藏在确认框的标题后面。
 *
 * 表单体挂在 DialogContent 里（BaseUI 关闭即卸载）：打开即空文本、成功后关窗，不需要 effect 重置。
 * 写通道走 `useMutation`，反馈（成功/失败 toast）由全局 MutationCache 按 `meta` 执行；
 * 后端 422 的字段级明细另走一条通道落进这个框（见 `onSubmit` 的 catch）。
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
                    <ReplyForm
                        reviewId={reviewId}
                        onOpenChange={setOpen}
                    />
                </DialogContent>
            </Dialog>
        </>
    )
}

function ReplyForm({
    reviewId,
    onOpenChange,
}: {
    reviewId: string
    onOpenChange: (open: boolean) => void
}) {
    const reply = useMutation({
        mutationFn: (text: string) =>
            SellerReviewsApi.replyReview({ path: { id: reviewId }, body: { text } }),
        meta: {
            success: "回复已发布",
            error: "回复失败",
            invalidates: [reviewKeys.all],
        },
    })

    const form = useAppForm({
        defaultValues: { text: "" },
        validators: { onSubmit: ReplySchema },
        onSubmit: async ({ value }) => {
            // DTO `ReplyReviewRequest` 只有一个 text，同名也列出来（列出来 = 我确认过它同名）：
            // 本地这把尺放行而后端拒绝（例如两端上限不一致的那次改动）才有地方落地
            try {
                await reply.mutateAsync(value.text.trim())
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { text: "text" }))
                // 只负责把错误写到框上然后原样抛出：接住 rejection 是 submitForm 的事
                throw error
            }
            // 失败不关窗：关了就把刚落地的那句红一起卸载，用户不知道哪儿错了
            onOpenChange(false)
        },
    })

    return (
        <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault()
                void submitForm(form)
            }}
        >
            <form.AppField name="text">
                {(field) => (
                    <field.TextareaField
                        label="回复内容（买家在商详页会看到，只能回一次）"
                        placeholder="感谢反馈，我们会尽快改进"
                        maxLength={NOTE_MAX}
                    />
                )}
            </form.AppField>
            <FormActions
                pending={reply.isPending}
                disableCancel={reply.isPending}
                submitLabel="发布回复"
                onCancel={() => onOpenChange(false)}
            />
        </form>
    )
}
