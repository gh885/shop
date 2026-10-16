import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { localizeStatusOptions, useI18n } from "@shop/app-kit/i18n"
import { COUPON_NAME_MAX } from "@shop/common/domain"
import { COUPON_TYPE_ITEMS, couponRequestFromForm, CouponFormSchema, emptyCouponForm } from "./form"
import { useCreateCoupon } from "./queries"

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
    const t = useT()
    const create = useCreateCoupon(shopId)
    const { locale } = useI18n()

    const form = useAppForm({
        defaultValues: emptyCouponForm(),
        validators: { onSubmit: CouponFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(couponRequestFromForm(value))
            } catch (error) {
                // 只列「有值级校验注解且有对应输入框」的字段；金额格（表单存元文本、DTO 是 Money）落不了红，别往里加
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
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
            <DialogTitle>{t("coupon.form.title")}</DialogTitle>
            <DialogDescription>{t("coupon.form.intro")}</DialogDescription>

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
                            label={t("coupon.form.name.label")}
                            required
                            placeholder={t("coupon.form.name.placeholder")}
                            maxLength={COUPON_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="type">
                    {(field) => (
                        <field.SelectField
                            label={t("coupon.form.type.label")}
                            items={localizeStatusOptions(COUPON_TYPE_ITEMS, t)}
                        />
                    )}
                </form.AppField>

                <div className="grid gap-4 sm:grid-cols-2">
                    <form.AppField name="thresholdYuan">
                        {(field) => (
                            <field.TextField
                                label={t("coupon.form.threshold.label")}
                                required
                                inputMode="decimal"
                                placeholder={t("coupon.form.threshold.placeholder")}
                            />
                        )}
                    </form.AppField>
                    <form.Subscribe selector={(s) => s.values.type}>
                        {(type) =>
                            type === "DISCOUNT" ? (
                                <form.AppField name="discountRate">
                                    {(field) => (
                                        <field.TextField
                                            label={t("coupon.form.rate.label")}
                                            required
                                            inputMode="decimal"
                                            placeholder={t("coupon.form.rate.placeholder")}
                                        />
                                    )}
                                </form.AppField>
                            ) : (
                                <form.AppField name="discountYuan">
                                    {(field) => (
                                        <field.TextField
                                            label={t("coupon.form.discount.label")}
                                            required
                                            inputMode="decimal"
                                            placeholder={t("coupon.form.discount.placeholder")}
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
                                        label={t("coupon.form.maxDiscount.label")}
                                        required
                                        inputMode="decimal"
                                        placeholder={t("coupon.form.maxDiscount.placeholder")}
                                        hint={t("coupon.form.maxDiscount.hint")}
                                    />
                                )}
                            </form.AppField>
                        ) : null
                    }
                </form.Subscribe>

                <form.AppField name="totalQuantity">
                    {(field) => (
                        <field.TextField
                            label={t("coupon.form.total.label")}
                            required
                            inputMode="numeric"
                            placeholder={t("coupon.form.total.placeholder")}
                        />
                    )}
                </form.AppField>

                <div className="grid gap-4 sm:grid-cols-2">
                    <form.AppField name="validFrom">
                        {(field) => (
                            <field.DateTimeField
                                label={t("coupon.form.windowFrom.label")}
                                required
                                hint={t("coupon.form.windowFrom.hint")}
                                locale={locale}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="validTo">
                        {(field) => (
                            <field.DateTimeField
                                label={t("coupon.form.windowTo.label")}
                                required
                                hint={t("coupon.form.windowTo.hint")}
                                locale={locale}
                            />
                        )}
                    </form.AppField>
                </div>

                <form.AppField name="validDays">
                    {(field) => (
                        <field.TextField
                            label={t("coupon.form.validDays.label")}
                            inputMode="numeric"
                            placeholder={t("coupon.form.validDays.placeholder")}
                            hint={t("coupon.form.validDays.hint")}
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={create.isPending}
                    submitLabel={t("coupon.form.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
