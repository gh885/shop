import { message } from "#/locales/message"
import { z } from "zod"

import { errorText, useI18n } from "@shop/app-kit/i18n"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import {
    isCodeError,
    isSmsRateLimit,
    RESEND_COUNTDOWN_SECONDS,
    SMS_CODE_DIGITS,
    SmsCodeSchema,
    useCountdown,
} from "@shop/app-kit/auth"
import { toApiError } from "@shop/common/contract"
import { AccountDeletionApi } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Field,
    FieldError,
    FieldLabel,
    FormError,
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { useMutation } from "@tanstack/react-query"
import { useId, useState } from "react"

import { useT } from "#/locales/use-t"
import { deletionKeys } from "./queries"
import { DISPOSITIONS, TONE_CLASS } from "./constants"

const CodeSchema = z.object({ code: SmsCodeSchema })

export interface DeletionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 冷静期天数：来自后端注销状态（单一真相源），不在前端写死 */
    coolingOffDays: number
}

export function DeletionDialog({ open, onOpenChange, coolingOffDays }: DeletionDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DeletionForm
                    onOpenChange={onOpenChange}
                    coolingOffDays={coolingOffDays}
                />
            </DialogContent>
        </Dialog>
    )
}

function DeletionForm({
    onOpenChange,
    coolingOffDays,
}: Pick<DeletionDialogProps, "onOpenChange" | "coolingOffDays">) {
    const { locale } = useI18n()
    const t = useT()
    const codeId = useId()
    const [countdown, setCountdown] = useCountdown()
    const [formError, setFormError] = useState<string | undefined>()

    const send = useMutation({
        mutationFn: () => AccountDeletionApi.sendDeletionCode(),
        meta: { silentError: true },
        onSuccess: () => setCountdown(RESEND_COUNTDOWN_SECONDS),
        onError: (e) => {
            const err = toApiError(e)
            if (isSmsRateLimit(err)) setCountdown(RESEND_COUNTDOWN_SECONDS)
            setFormError(errorText(err, locale))
        },
    })

    const request = useMutation({
        mutationFn: (code: string) => AccountDeletionApi.requestDeletion({ body: { code } }),
        meta: {
            success: message("account.deletion.toast.requested", { days: coolingOffDays }),
            silentError: true,
            invalidates: [deletionKeys.all],
        },
        onSuccess: () => onOpenChange(false),
    })

    const form = useAppForm({
        defaultValues: { code: "" },
        validators: { onSubmit: CodeSchema },
        onSubmit: async ({ value }) => {
            try {
                await request.mutateAsync(CodeSchema.parse(value).code)
            } catch (error) {
                const err = toApiError(error)
                const texts = serverFieldErrors(error, { code: "code" })
                if (isCodeError(err)) texts.code = errorText(err, locale)
                applyServerFieldErrors(form, texts)
                setFormError(Object.keys(texts).length === 0 ? errorText(err, locale) : undefined)
                throw error
            }
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>{t("account.deletion.title")}</DialogTitle>
                <DialogDescription>
                    {t("account.deletion.description", { days: coolingOffDays })}
                </DialogDescription>
            </DialogHeader>

            <dl className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
                {DISPOSITIONS.map((d) => (
                    <div
                        key={d.tone}
                        className="flex gap-3 text-sm"
                    >
                        <dt className={`w-20 shrink-0 font-medium ${TONE_CLASS[d.tone]}`}>
                            {t(d.titleKey)}
                        </dt>
                        <dd className="text-muted-foreground">{t(d.itemsKey)}</dd>
                    </div>
                ))}
            </dl>

            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                <form.AppField name="code">
                    {(field) => (
                        <Field>
                            <FieldLabel
                                htmlFor={codeId}
                                required
                            >
                                {t("account.deletion.codeLabel")}
                            </FieldLabel>
                            <div className="flex items-center gap-2">
                                <InputOTP
                                    id={codeId}
                                    aria-label={t("account.deletion.codeLabel")}
                                    aria-invalid={!field.state.meta.isValid}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={SMS_CODE_DIGITS}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => {
                                        field.handleChange(v.replaceAll(/\D/g, ""))
                                        setFormError(undefined)
                                    }}
                                >
                                    <InputOTPGroup>
                                        {Array.from({ length: SMS_CODE_DIGITS }, (_, index) => (
                                            <InputOTPSlot
                                                /* eslint-disable-next-line react/no-array-index-key -- 格位由 index 本身定义，不随数据增减 */
                                                key={index}
                                                index={index}
                                            />
                                        ))}
                                    </InputOTPGroup>
                                </InputOTP>
                                <Button
                                    variant="link"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={countdown > 0 || send.isPending}
                                    onClick={() => send.mutate()}
                                >
                                    {countdown > 0 ? (
                                        <span className="tabular-nums">
                                            {t("account.deletion.resend", { countdown })}
                                        </span>
                                    ) : send.isPending ? (
                                        <Spinner />
                                    ) : (
                                        t("account.deletion.sendCode")
                                    )}
                                </Button>
                            </div>
                            <FieldError errors={field.state.meta.errors} />
                        </Field>
                    )}
                </form.AppField>

                <FormError>{formError}</FormError>

                <FormActions
                    pending={request.isPending}
                    destructive
                    submitLabel={t("account.deletion.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
