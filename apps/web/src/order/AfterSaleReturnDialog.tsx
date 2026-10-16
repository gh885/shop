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
    orderId: string
    defaultLogisticsCompany?: string | null
    defaultTrackingNo?: string | null
    returnAddress?: string | null
}

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

function ReturnForm({
    onOpenChange,
    orderId,
    defaultLogisticsCompany,
    defaultTrackingNo,
    returnAddress,
}: Omit<AfterSaleReturnDialogProps, "open">) {
    const submitReturn = useReturnAfterSale(orderId)
    const t = useT()

    const form = useAppForm({
        defaultValues: {
            logisticsCompany: defaultLogisticsCompany ?? "",
            trackingNo: defaultTrackingNo ?? "",
        },
        validators: { onSubmit: ReturnSchema },
        onSubmit: async ({ value }) => {
            try {
                await submitReturn.mutateAsync(value)
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
                {returnAddress !== undefined && (
                    <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                        {returnAddress ? (
                            <>
                                <span className="text-muted-foreground">
                                    {t("order.afterSale.return.addressLabel")}
                                </span>
                                <p className="mt-1 font-medium text-foreground">{returnAddress}</p>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                {t("order.afterSale.card.returnAddressMissing")}
                            </span>
                        )}
                    </div>
                )}

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
