import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

/**
 * 取消订单弹窗：选一个快捷原因（可跳过不选）+ 自填备注，替代原先的全局二次确认。
 *
 * 后端 reason 是自由文本（可空、最长 200 字），这里不造枚举映射——提交的就是
 * 「选项文案（：备注）」这一句话，超时关单等系统文案仍由后端自己写。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，换单/重开都是一份干净的本地状态。
 */

/** 快捷原因：产品拍板的三项；「其他」也照实发送，配合备注给客服留线索 */
const REASON_OPTIONS = ["不想买了", "信息填错", "其他"].map((reason) => ({
    value: reason,
    label: reason,
}))

/** 备注封顶：留出「原因：」拼接与最长选项的长度，保证整体不超后端 @Size(max=200) */
const NOTE_MAX_LENGTH = 180

export interface CancelOrderDialogProps {
    /** 待取消的单（含 id 与展示用单号）；未传 = 关闭 */
    order?: { id: string; orderNo: string }
    onOpenChange: (open: boolean) => void
    /** 取消请求进行中：确认按钮转圈并禁用 */
    pending: boolean
    /** 确认取消：reason 为快捷原因 + 备注拼好的自由文本，一个都没填则不给占位文案 */
    onConfirm: (reason?: string) => void
}

export function CancelOrderDialog({ order, onOpenChange, ...props }: CancelOrderDialogProps) {
    return (
        <Dialog
            open={order !== undefined}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                {order && (
                    <CancelForm
                        {...props}
                        orderNo={order.orderNo}
                        onOpenChange={onOpenChange}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}

function CancelForm({
    orderNo,
    onOpenChange,
    pending,
    onConfirm,
}: Omit<CancelOrderDialogProps, "order"> & { orderNo: string }) {
    const form = useAppForm({
        defaultValues: { reason: "", note: "" },
        onSubmit: ({ value }) =>
            onConfirm([value.reason, value.note.trim()].filter(Boolean).join("：") || undefined),
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>取消订单</DialogTitle>
                <DialogDescription>
                    订单号 {orderNo}
                    。该操作不可恢复；待发货订单取消后将退款到原支付账户。
                </DialogDescription>
            </DialogHeader>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <form.AppField name="reason">
                    {(field) => (
                        <field.RadioGroupField
                            label="取消原因（选填）"
                            options={REASON_OPTIONS}
                        />
                    )}
                </form.AppField>

                <form.AppField name="note">
                    {(field) => (
                        <field.TextareaField
                            label="备注"
                            hint="补充说明（选填），如「地址填错了想改单」"
                            maxLength={NOTE_MAX_LENGTH}
                            rows={3}
                            placeholder="想对卖家说的话（选填）"
                        />
                    )}
                </form.AppField>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        再想想
                    </Button>
                    <Button
                        type="submit"
                        disabled={pending}
                    >
                        {pending && <Spinner />}确认取消
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}
