import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { AuthApi, SubaccountAuthApi } from "@shop/api/sdk"
import {
    CAPTCHA_CODE_DIGITS,
    PasswordField,
    RESEND_COUNTDOWN_SECONDS,
    SubmitButton,
    TextField,
    isCaptchaError,
    isSmsRateLimit,
    useCaptcha,
    useCountdown,
} from "@shop/app-kit/auth"
import { notify } from "@shop/app-kit/data"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { ErrorCodes, toApiError, type ApiError } from "@shop/common/contract"
import {
    Button,
    Field,
    FormError,
    InputGroup,
    InputGroupButton,
    InputGroupInput,
    Skeleton,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { getDeviceId, tokenStore } from "#/shared/lib/api"
import { useClearMe } from "#/shared/lib/me"
import { setSessionKind } from "#/shared/lib/session-kind"

import {
    SubaccountActivateFormSchema,
    SubaccountLoginFormSchema,
    type SubaccountStep,
} from "./subaccount-form"

// 必须是模块级稳定引用：inline 闭包会让 useCaptcha 的 refresh 依赖变，每次渲染都拉一次图
const getCaptcha = () => AuthApi.getCaptcha()

// oxlint-disable-next-line react-doctor/no-giant-component -- 与 app-kit 的 LoginForm 同一处置：两个表单实例各自的 AppField 渲染 prop（每字段 30-60 行）+ 一套发码/倒计时/图形码交互，抽子组件要传 form 实例与 8+ 回调，接口比行数更宽
export function SubaccountLoginForm() {
    const t = useT()
    const { locale } = useI18n()
    const navigate = useNavigate()
    const [step, setStep] = useState<SubaccountStep>("login")
    const [submitError, setSubmitError] = useState<ApiError>()
    const [sendingCode, setSendingCode] = useState(false)
    const [countdown, startCountdown] = useCountdown()
    const serverErrorRef = useRef<HTMLParagraphElement>(null)
    const clearMe = useClearMe()
    const {
        captchaId,
        image,
        loading: captchaLoading,
        refresh: refreshCaptcha,
        reset: resetCaptcha,
        clear: clearCaptcha,
    } = useCaptcha(getCaptcha)

    const form = useAppForm({
        defaultValues: { loginName: "", password: "", phone: "", code: "", captchaCode: "" },
        validators: {
            onSubmit: step === "login" ? SubaccountLoginFormSchema : SubaccountActivateFormSchema,
        },
        onSubmit: async ({ value }) => {
            setSubmitError(undefined)
            try {
                if (step === "login") {
                    const res = await SubaccountAuthApi.login({
                        body: {
                            loginName: value.loginName,
                            password: value.password,
                            deviceId: getDeviceId(),
                        },
                    })
                    finish(res.accessToken)
                    return
                }
                const res = await SubaccountAuthApi.activate({
                    body: {
                        loginName: value.loginName,
                        phone: value.phone,
                        code: value.code,
                        deviceId: getDeviceId(),
                    },
                })
                finish(res.accessToken)
            } catch (error) {
                // SUBACCOUNT_NOT_ACTIVATED 是可继续的失败：切到激活步骤，不当登录错误报出去
                const err = toApiError(error)
                if (err.code === ErrorCodes.SUBACCOUNT_NOT_ACTIVATED) {
                    setStep("activate")
                    return
                }
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        loginName: "loginName",
                        password: "password",
                        phone: "phone",
                        code: "code",
                    }),
                )
                setSubmitError(err)
                // 继续抛：接口错由 submitForm 静默（上面已提示），非接口错要被监控上报——这里吞掉就是点了没反应
                throw error
            }
        },
    })

    function finish(accessToken: string) {
        clearMe()
        // 顺序不能反：tokenStore.set 会放行受保护路由取数，那请求必须已读到「这是子账号会话」
        setSessionKind("subaccount")
        tokenStore.set(accessToken)
        void navigate({ to: "/", replace: true })
    }

    useEffect(() => {
        if (step === "activate") void refreshCaptcha()
    }, [step, refreshCaptcha])

    useEffect(() => {
        if (submitError) serverErrorRef.current?.focus()
    }, [submitError])

    const serverErrorText = submitError ? errorText(submitError, locale) : undefined

    function handleSendCode() {
        if (!image) {
            notify.error(message("login.captchaLoading"))
            void refreshCaptcha()
            return
        }
        const captchaCode = form.getFieldValue("captchaCode")
        if (captchaCode.length !== CAPTCHA_CODE_DIGITS) {
            document.getElementById("subaccount-captchaCode")?.focus()
            return
        }

        setSendingCode(true)
        void SubaccountAuthApi.sendActivationCode({
            body: {
                loginName: form.getFieldValue("loginName"),
                phone: form.getFieldValue("phone"),
                captchaId,
                captchaCode,
            },
        })
            .then(() => {
                startCountdown(RESEND_COUNTDOWN_SECONDS)
                notify.success(message("login.codeSent"))
                // 图形码一次性：用完即废，连同输入一起清掉，等倒计时结束再拉新的
                clearCaptcha()
                form.setFieldValue("captchaCode", "")
                document.getElementById("subaccount-code")?.focus()
                // 必须 return 或抛（oxlint promise/always-return）：这条链终点是 .finally，没人读值
                return undefined
            })
            .catch((error: unknown) => {
                const err = toApiError(error)
                setSubmitError(err)
                if (isCaptchaError(err)) {
                    resetCaptcha()
                    form.setFieldValue("captchaCode", "")
                }
                // 429 限频：服务端窗口就是 60s，命中时本地同样起倒计时，否则连点只会再撞一次限流
                if (isSmsRateLimit(err)) startCountdown(RESEND_COUNTDOWN_SECONDS)
                notify.fromError(err)
            })
            .finally(() => setSendingCode(false))
    }

    return (
        <form
            className="flex min-w-0 flex-1 flex-col gap-6"
            onSubmit={(e) => {
                e.preventDefault()
                void submitForm(form)
            }}
        >
            {step === "login" ? (
                <div className="flex flex-col gap-4">
                    <form.AppField name="loginName">
                        {(field) => (
                            <TextField
                                field={field}
                                id="subaccount-loginName"
                                ariaLabel={t("login.subaccount.loginName")}
                                placeholder={t("login.subaccount.loginNamePlaceholder")}
                                skin="filled"
                                autoComplete="username"
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="password">
                        {(field) => (
                            <PasswordField
                                field={field}
                                id="subaccount-password"
                                label={t("login.passwordLabel")}
                                placeholder={t("login.passwordPlaceholder")}
                            />
                        )}
                    </form.AppField>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <div>
                        <h2 className="font-semibold">{t("login.subaccount.activate.title")}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {t("login.subaccount.activate.desc")}
                        </p>
                    </div>

                    <Field>
                        <InputGroup
                            size="lg"
                            variant="filled"
                        >
                            <InputGroupInput
                                aria-label={t("login.subaccount.loginName")}
                                readOnly
                                value={form.getFieldValue("loginName")}
                            />
                        </InputGroup>
                    </Field>

                    <form.AppField name="phone">
                        {(field) => (
                            <TextField
                                field={field}
                                id="subaccount-phone"
                                ariaLabel={t("login.subaccount.phone")}
                                placeholder={t("login.subaccount.phonePlaceholder")}
                                skin="filled"
                                inputMode="tel"
                                autoComplete="tel"
                                filter="digits"
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="code">
                        {(field) => (
                            <TextField
                                field={field}
                                id="subaccount-code"
                                ariaLabel={t("login.smsCodeLabel")}
                                placeholder={t("login.smsCodePlaceholder")}
                                skin="filled"
                                code
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                filter="digits"
                                trailing={
                                    <InputGroupButton
                                        variant="link"
                                        size="sm"
                                        className="h-full shrink-0 px-3.5"
                                        disabled={countdown > 0 || sendingCode}
                                        onClick={handleSendCode}
                                    >
                                        {countdown > 0 ? (
                                            <span className="tabular-nums">
                                                {t("login.resend", { countdown })}
                                            </span>
                                        ) : sendingCode ? (
                                            <Spinner />
                                        ) : (
                                            t("login.sendCode")
                                        )}
                                    </InputGroupButton>
                                }
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="captchaCode">
                        {(field) => (
                            <TextField
                                field={field}
                                id="subaccount-captchaCode"
                                ariaLabel={t("login.captchaLabel")}
                                placeholder={t("login.captchaPlaceholder")}
                                skin="filled"
                                code
                                autoComplete="off"
                                filter="upper"
                                trailing={
                                    <button
                                        type="button"
                                        aria-label={t("login.captchaRefresh")}
                                        onClick={() => void refreshCaptcha()}
                                        className="shrink-0 self-stretch border-l border-border/60"
                                    >
                                        {image ? (
                                            <img
                                                src={image}
                                                alt={t("login.captchaAlt")}
                                                className="h-full w-24 rounded-r-xl"
                                            />
                                        ) : captchaLoading ? (
                                            <Skeleton className="h-full w-24" />
                                        ) : (
                                            <span className="flex h-full w-24 items-center justify-center text-xs text-muted-foreground">
                                                {t("login.captchaClick")}
                                            </span>
                                        )}
                                    </button>
                                }
                            />
                        )}
                    </form.AppField>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => {
                            setStep("login")
                            setSubmitError(undefined)
                        }}
                    >
                        {t("login.subaccount.activate.back")}
                    </Button>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                    {({ isSubmitting }) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={
                                step === "login"
                                    ? t("login.subaccount.submit")
                                    : t("login.subaccount.activate.submit")
                            }
                        />
                    )}
                </form.Subscribe>

                <div className="min-h-4">
                    <FormError
                        ref={serverErrorRef}
                        tabIndex={-1}
                    >
                        {serverErrorText}
                    </FormError>
                </div>
            </div>
        </form>
    )
}
