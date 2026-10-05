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
import { COOLING_OFF_DAYS, DISPOSITIONS, TONE_CLASS } from "./constants"

/**
 * 注销账号弹窗：数据处置清单 → 手机验证码 → 毁灭性确认，三件事在同一个弹窗里按顺序做完。
 *
 * 把「会丢掉什么」写在提交前而不是成功后：个保法第 47 条要的是知情删除，事后一份清单等于没告知。
 * 三档口径（清空 / 匿名保留 / 法定留存）与后端 ACC-76 的处置一致，改后端要同步这里。
 *
 * 验证码发给账号绑定的号码（号码由后端从 token 取，前端不报号），所以没有手机号输入框；
 * 提交后进的是冷静期而不是立刻删除，撤销入口在安全设置页那张卡上。
 */

const CodeSchema = z.object({ code: SmsCodeSchema })

export interface DeletionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function DeletionDialog({ open, onOpenChange }: DeletionDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DeletionForm onOpenChange={onOpenChange} />
            </DialogContent>
        </Dialog>
    )
}

function DeletionForm({ onOpenChange }: Pick<DeletionDialogProps, "onOpenChange">) {
    const { locale } = useI18n()
    const t = useT()
    const codeId = useId()
    const [countdown, setCountdown] = useCountdown()
    const [formError, setFormError] = useState<string | undefined>()

    // 发码是纯命令（没有 query 缓存要动），但要读错误码决定「429 也起倒计时」，故与提交共用一套本地错误态
    const send = useMutation({
        mutationFn: () => AccountDeletionApi.sendDeletionCode(),
        meta: { silentError: true },
        onSuccess: () => setCountdown(RESEND_COUNTDOWN_SECONDS),
        onError: (e) => {
            const err = toApiError(e)
            // 与登录发码同一判据（app-kit）：只有限频窗口才起倒计时，当日上限 60s 后重发也没用
            if (isSmsRateLimit(err)) setCountdown(RESEND_COUNTDOWN_SECONDS)
            setFormError(errorText(err, locale))
        },
    })

    const request = useMutation({
        mutationFn: (code: string) => AccountDeletionApi.requestDeletion({ body: { code } }),
        meta: {
            success: message("web.account.deletion.toast.requested", { days: COOLING_OFF_DAYS }),
            silentError: true,
            invalidates: [deletionKeys.all],
        },
        onSuccess: () => onOpenChange(false),
    })

    const form = useAppForm({
        defaultValues: { code: "" },
        validators: { onSubmit: CodeSchema },
        // 范本双通道：422 字段级（防御性，本地 CodeSchema 已先拦格式）与验证码类 400
        // （按 code 的「验证码错误/已失效」）都落到 code 框上，取代此前只打 aria-invalid 的自建
        // codeInvalid——错误挂进框后，FieldError 说清「为什么红」、aria-invalid 随 meta 走；
        // 落不到框的错误才退回底部 FormError 说一句。抛回交给 submitForm 兜住
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
                <DialogTitle>{t("web.account.deletion.title")}</DialogTitle>
                <DialogDescription>
                    {t("web.account.deletion.description", { days: COOLING_OFF_DAYS })}
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
                                {t("web.account.deletion.codeLabel")}
                            </FieldLabel>
                            {/* 六格分段码：假光标与「粘一次填满六格」由 input-otp 管，
                                数字过滤仍在 onChange 里剥（字母被吞掉而不是弹走提示） */}
                            <div className="flex items-center gap-2">
                                <InputOTP
                                    id={codeId}
                                    aria-label={t("web.account.deletion.codeLabel")}
                                    aria-invalid={!field.state.meta.isValid}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={SMS_CODE_DIGITS}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(v) => {
                                        field.handleChange(v.replaceAll(/\D/g, ""))
                                        // 重新输入即清落框的服务端错误（框架随值变化自动清 onServer 源），
                                        // 标红随之消失；下方 FormError 那句也一并擦掉
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
                                            {t("web.account.deletion.resend", { countdown })}
                                        </span>
                                    ) : send.isPending ? (
                                        <Spinner />
                                    ) : (
                                        t("web.account.deletion.sendCode")
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
                    submitLabel={t("web.account.deletion.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
