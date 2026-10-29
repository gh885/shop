import { z } from "zod"
import { VALIDATION_RULES } from "@shop/common/contract"
import {
    CARRIER_NAME_MAX,
    TRACKING_NO_MAX,
    TrackingNoSchema,
    withMaxLength,
} from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useReturnAfterSale } from "./after-sale-queries"

const ReturnSchema = z.object({
    logisticsCompany: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        CARRIER_NAME_MAX,
    ),
    trackingNo: TrackingNoSchema,
})

export interface AfterSaleReturnDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    caseId: string
}

/**
 * 买家寄回商品填运单。
 *
 * <p>契约是 `POST /buyer/returns/{caseId}/ship-back?carrierCode=&trackingNo=`：
 * `carrierCode` 是承运商编码（不是自由文本名），所以表单标签仍叫「承运商」，值按编码传。
 */
export function AfterSaleReturnDialog({
    open,
    onOpenChange,
    ...props
}: AfterSaleReturnDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                <ReturnForm
                    {...props}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function ReturnForm({ onOpenChange, caseId }: Omit<AfterSaleReturnDialogProps, "open">) {
    const submitReturn = useReturnAfterSale()
    const t = useT()

    const form = useAppForm({
        defaultValues: { logisticsCompany: "", trackingNo: "" },
        validators: { onSubmit: ReturnSchema },
        onSubmit: async ({ value }) => {
            try {
                await submitReturn.mutateAsync({
                    caseId,
                    carrierCode: value.logisticsCompany,
                    trackingNo: value.trackingNo,
                })
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        logisticsCompany: "logisticsCompany",
                        trackingNo: "trackingNo",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>{t("order.afterSale.action.return")}</DialogTitle>
                <DialogDescription>{t("order.afterSale.return.description")}</DialogDescription>
            </DialogHeader>

            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                <form.AppField name="logisticsCompany">
                    {(field) => (
                        <field.TextField
                            label={t("order.afterSale.return.carrierLabel")}
                            required
                            placeholder={t("order.afterSale.return.carrierPlaceholder")}
                            maxLength={CARRIER_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="trackingNo">
                    {(field) => (
                        <field.TextField
                            label={t("order.summary.info.trackingNo")}
                            required
                            placeholder={t("order.afterSale.return.trackingPlaceholder")}
                            maxLength={TRACKING_NO_MAX}
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={submitReturn.isPending}
                    submitLabel={t("order.afterSale.return.submitLabel")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
