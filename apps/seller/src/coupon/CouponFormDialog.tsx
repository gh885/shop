import { Dialog, DialogContent, DialogDescription, DialogTitle, useAppForm } from "@shop/ui-web"
import { FormActions } from "@shop/app-kit"

import { COUPON_NAME_MAX } from "@shop/common"

import { couponRequestFromForm, CouponFormSchema, emptyCouponForm } from "./form"
import { useCreateCoupon } from "./queries"

/**
 * 新建券弹窗。只有新建——接口没有「改券」，UI 也就不给编辑入口（原因见页面上的说明）。
 *
 * 提交成功即关闭：新建的券按创建时间倒序出现在列表第一页，用户马上能看到结果。
 * 失败不关闭：报错由全局写操作反馈统一 toast，弹窗留着是为了别丢掉已填的内容。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，每次打开都是空白表单——上一次失败留下的值不该跟着进下一张券。
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
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <CouponForm
                    shopId={shopId}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function CouponForm({
    shopId,
    onOpenChange,
}: {
    shopId: string
    onOpenChange: (open: boolean) => void
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
                // 错误已由全局写操作反馈统一 toast，这里只负责让弹窗留在原地
            }
        },
    })

    return (
        <>
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
                            maxLength={COUPON_NAME_MAX}
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

                <FormActions
                    pending={create.isPending}
                    submitLabel="创建"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
