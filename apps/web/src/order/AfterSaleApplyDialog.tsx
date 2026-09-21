import { z } from "zod"
import { TicketType } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    FieldShell,
    firstFieldError,
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
    RadioGroup,
    RadioGroupItem,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { AFTER_SALE_TYPE_HINT, AFTER_SALE_TYPE_LABEL, AFTER_SALE_TYPE_ORDER } from "./constants"
import { useApplyAfterSale } from "./after-sale-queries"

/**
 * 申请售后弹窗：选类型（货留不留）+ 填理由。
 *
 * 两类售后对买家的承诺完全不同（仅退款=不用寄回，退货退款=要寄回），所以类型用带说明的单选，
 * 不用下拉——把「要不要寄回」这句话摆在选择项里，比选完再解释便宜。
 * 理由是选填（后端 reason 可空），空串按没填处理。
 */

/** 表单入参校验（与后端 @Size(max = 200) 对齐；表单局部 schema，非领域契约） */
const ApplySchema = z.object({
    type: z.enum(TicketType),
    reason: z.string().max(200, "售后理由最长 200 字"),
})

/** 默认选「仅退款」：更轻的那条路先给，要寄回得自己切过去（两项各有说明，切错成本低） */
const DEFAULT_VALUES: { type: TicketType; reason: string } = {
    type: TicketType.REFUND_ONLY,
    reason: "",
}

/** 单选回传的是 string，收窄成契约枚举再进表单：非法值不进表单状态，也就不必在提交时兜底 */
const isTicketType = (value: string): value is TicketType => value in TicketType

export interface AfterSaleApplyDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    /** 订单号，给弹窗一句「在申请哪个单」的上下文 */
    orderNo: string
}

export function AfterSaleApplyDialog({
    open,
    onOpenChange,
    orderId,
    orderNo,
}: AfterSaleApplyDialogProps) {
    const apply = useApplyAfterSale(orderId)

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        // 用 mutate 而不是 mutateAsync：失败已在 mutation 的 onError 里统一提示（notify.fromError），
        // 这里再 await 一个必然 reject 的 promise 只会得到一个没人接的 unhandled rejection
        onSubmit: ({ value }) => {
            apply.mutate(value, {
                onSuccess: () => {
                    onOpenChange(false)
                    form.reset()
                },
            })
        },
    })

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>申请售后</DialogTitle>
                    <DialogDescription>
                        订单号 {orderNo}。提交后由卖家处理，处理前你可以随时撤销。
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="mt-4 flex flex-col gap-5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void form.handleSubmit()
                    }}
                >
                    <form.AppField name="type">
                        {(field) => (
                            <FieldShell
                                label="售后类型"
                                required
                                error={firstFieldError(field)}
                            >
                                <RadioGroup
                                    value={field.state.value}
                                    onValueChange={(v: string) => {
                                        if (isTicketType(v)) field.handleChange(v)
                                    }}
                                >
                                    {AFTER_SALE_TYPE_ORDER.map((type) => (
                                        <Item
                                            key={type}
                                            variant={
                                                field.state.value === type
                                                    ? "selected"
                                                    : "selectable"
                                            }
                                            size="sm"
                                        >
                                            {/* 可访问名与可见标题同词（label-in-name）：类型名短，说明留在行内灰字里 */}
                                            <RadioGroupItem
                                                value={type}
                                                aria-label={AFTER_SALE_TYPE_LABEL[type]}
                                            />
                                            <ItemContent>
                                                <ItemTitle>{AFTER_SALE_TYPE_LABEL[type]}</ItemTitle>
                                                <ItemDescription lines={1}>
                                                    {AFTER_SALE_TYPE_HINT[type]}
                                                </ItemDescription>
                                            </ItemContent>
                                        </Item>
                                    ))}
                                </RadioGroup>
                            </FieldShell>
                        )}
                    </form.AppField>

                    <form.AppField name="reason">
                        {(field) => (
                            <field.TextareaField
                                label="售后理由"
                                placeholder="说明问题，便于卖家判断（选填）"
                                maxLength={200}
                                rows={3}
                            />
                        )}
                    </form.AppField>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            disabled={apply.isPending}
                        >
                            {apply.isPending && <Spinner />}提交申请
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
