import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import { FormActions, serverFieldErrorTexts, submitForm, useI18n } from "@shop/app-kit"

import { COUPON_NAME_MAX } from "@shop/common"

import { COUPON_TYPE_ITEMS, couponRequestFromForm, CouponFormSchema, emptyCouponForm } from "./form"
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
    const { locale } = useI18n()

    const form = useAppForm({
        defaultValues: emptyCouponForm(),
        validators: { onSubmit: CouponFormSchema },
        onSubmit: async ({ value }) => {
            // 此前这里是 `catch {}`（静默吞掉一切，包括「代码坏了」那一类）——违反约定，清掉。
            // 现在只做「把字段级错误写到对应框上」然后原样抛出，rejection 由 submitForm 接住：
            // 接口错误交全局 toast（mutation 的 meta.error），非接口错误上报监控。
            try {
                await create.mutateAsync(couponRequestFromForm(value))
            } catch (error) {
                // map 只列有值级校验注解、且有对应输入框的字段（name/totalQuantity/validDays 有 @Size/@Min/@Max，
                // type/validFrom/validTo 只有裸 @NotNull——必填项恒发，一并列出=确认过）。
                // 排除：threshold/discount/maxDiscount 三个金额格（表单存「元」文本、DTO 是 Money，无对应可落红的框）、
                // discountRate（DTO 无校验注解，范围在 service 判成 400，不落 422 字段错）。
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        name: "name",
                        type: "type",
                        totalQuantity: "totalQuantity",
                        validFrom: "validFrom",
                        validTo: "validTo",
                        validDays: "validDays",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogTitle>新建优惠券</DialogTitle>
            <DialogDescription>
                创建后立即进入发放窗口，买家可在店铺页领取。金额一律填「元」；折扣券的折率填 0.9
                表示 9 折，且必须给最高减免。
            </DialogDescription>

            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault()
                    void submitForm(form)
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

                <form.AppField name="type">
                    {(field) => (
                        <field.SelectField
                            label="券型"
                            items={COUPON_TYPE_ITEMS}
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
                    {/* 两型的面值格互斥：满减填面额，折扣填折率 + 封顶。
                        用 form.Subscribe 读当前券型切换显示——两张表单各写一遍字段会漂 */}
                    {/* 两型的面值格互斥：满减填面额，折扣填折率。
                        券型经 form.Subscribe 读（写在 JSX children 上而不是 children={…} 属性：
                        后者把渲染函数当普通 prop 传，读起来像「传了个值」而不是「这是个渲染器」） */}
                    <form.Subscribe selector={(s) => s.values.type}>
                        {(type) =>
                            type === "DISCOUNT" ? (
                                <form.AppField name="discountRate">
                                    {(field) => (
                                        <field.TextField
                                            label="折扣率（0.90 = 9 折）"
                                            required
                                            inputMode="decimal"
                                            placeholder="例如：0.9"
                                        />
                                    )}
                                </form.AppField>
                            ) : (
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
                            )
                        }
                    </form.Subscribe>
                </div>

                <form.Subscribe selector={(s) => s.values.type}>
                    {(type) =>
                        type === "DISCOUNT" ? (
                            <form.AppField name="maxDiscountYuan">
                                {(field) => (
                                    <field.TextField
                                        label="最高减免（元）"
                                        required
                                        inputMode="decimal"
                                        placeholder="大单不至于亏穿，例如：50"
                                        hint="必填：没有封顶的折扣券在大额订单上会亏穿"
                                    />
                                )}
                            </form.AppField>
                        ) : null
                    }
                </form.Subscribe>

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
                            <field.DateTimeField
                                label="发放窗口起点"
                                required
                                hint="从这一刻起可以领"
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="validTo">
                        {(field) => (
                            <field.DateTimeField
                                label="发放窗口终点"
                                required
                                hint="到这一刻为止可以领"
                            />
                        )}
                    </form.AppField>
                </div>

                <form.AppField name="validDays">
                    {(field) => (
                        <field.TextField
                            label="领取后有效天数（可留空）"
                            inputMode="numeric"
                            placeholder="例如：7"
                            hint="留空 = 领到的券可用期跟随发放窗口；填了则从领取那一刻起算（1~365）"
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={create.isPending}
                    submitLabel="创建"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
