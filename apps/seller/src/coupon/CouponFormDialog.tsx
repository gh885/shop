import { useEffect } from "react"

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { couponRequestFromForm, CouponFormSchema, emptyCouponForm } from "./form"
import { useCreateCoupon } from "./queries"

/**
 * 新建券弹窗。只有新建——接口没有「改券」，UI 也就不给编辑入口（原因见页面上的说明）。
 *
 * 提交成功即关闭：新建的券按创建时间倒序出现在列表第一页，用户马上能看到结果。
 * 失败不关闭：报错由 useWriteMutation 统一 toast，弹窗留着是为了别丢掉已填的内容。
 */
export function CouponFormDialog({
    open,
    onOpenChange,
    shopId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    shopId: string
}) {
    const create = useCreateCoupon(shopId)

    const form = useAppForm({
        defaultValues: emptyCouponForm(),
        validators: { onSubmit: CouponFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(couponRequestFromForm(value))
                onOpenChange(false)
            } catch {
                // 错误已由 useWriteMutation 统一 toast，这里只负责让弹窗留在原地
            }
        },
    })

    // 每次打开都回到空白表单：上一次失败留下的值不该跟着进下一张券
    useEffect(() => {
        if (open) form.reset(emptyCouponForm())
        // form 实例稳定，重置只跟随开关
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogTitle>新建优惠券</DialogTitle>
                <DialogDescription>
                    创建后立即按有效期发放，买家可在店铺页领取。金额一律填「元」。
                </DialogDescription>

                <form
                    className="mt-4 flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void form.handleSubmit()
                    }}
                >
                    <form.AppField name="name">
                        {(field) => (
                            <field.TextField
                                label="券名"
                                required
                                placeholder="例如：新春满减券"
                                maxLength={60}
                            />
                        )}
                    </form.AppField>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <form.AppField name="thresholdYuan">
                            {(field) => (
                                <field.TextField
                                    label="使用门槛（元）"
                                    required
                                    inputMode="decimal"
                                    placeholder="0 表示无门槛"
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="discountYuan">
                            {(field) => (
                                <field.TextField
                                    label="面额（元）"
                                    required
                                    inputMode="decimal"
                                    placeholder="例如：10"
                                />
                            )}
                        </form.AppField>
                    </div>

                    <form.AppField name="totalQuantity">
                        {(field) => (
                            <field.TextField
                                label="发放总量"
                                required
                                inputMode="numeric"
                                placeholder="例如：100"
                            />
                        )}
                    </form.AppField>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <form.AppField name="validFrom">
                            {(field) => (
                                <field.TextField
                                    label="有效期起点"
                                    required
                                    type="datetime-local"
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="validTo">
                            {(field) => (
                                <field.TextField
                                    label="有效期终点"
                                    required
                                    type="datetime-local"
                                />
                            )}
                        </form.AppField>
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            disabled={create.isPending}
                        >
                            {create.isPending ? <Spinner /> : undefined}
                            创建
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
