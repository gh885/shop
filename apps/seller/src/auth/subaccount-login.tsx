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

/**
 * 图形验证码的取图动作。**必须是模块级稳定引用**：`useCaptcha` 把它放进 `refresh` 的
 * 依赖里，行内闭包会让「进入激活步骤即拉图」的 effect 每渲染打一次后端
 * （web 端同源做法见 apps/web/src/auth/actions.ts，seller 登录页的店主表单同理）。
 */
const getCaptcha = () => AuthApi.getCaptcha()

/**
 * 子账号登录：口令登录 → （未激活时）就地切到激活步骤。
 *
 * 为什么是「就地切步骤」而不是弹一条「请先激活」再让用户自己找入口：`SUBACCOUNT_NOT_ACTIVATED`
 * 是一个**可继续**的失败——用户已经把登录名和口令输对了，缺的只有「本人手机号验一次」。
 * 把这一步放在这里，等于把后端那条 403 翻成一条主流程；弹个 toast 再要求用户猜去哪里激活，
 * 是把系统的状态机甩给用户背。
 *
 * 与店主表单分开而不是塞进 `@shop/app-kit` 的 `LoginForm`：那一个的「手机号 + 验证码 / 口令」
 * 是买家账号体系的形状，字段与提交动作都不同（这里第一格是登录名）。硬塞进去要给它加一层
 * 「哪种登录」的开关，两端各背一半不属于自己的字段。
 */
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
                // 「还没验号」是**可继续**的失败：切到激活步骤，而不是当登录错误报出去。
                // 这一格是后端门禁要的读点——注册表声明本码「按码分支」，扫不到就是声明撒谎
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
                // 继续往外抛：接口错误由 submitForm 静默（上面那行已经把话说给用户），
                // 非接口错误（映射写错之类）它会上报监控——在这里吞掉就是「点了没反应」
                throw error
            }
        },
    })

    /** 登录成功 / 激活成功的收尾：先丢掉上一位登录者的身份缓存、再定会话种类，最后写令牌 */
    function finish(accessToken: string) {
        clearMe()
        // 顺序不能反：tokenStore.set 会通知订阅者、放行受保护路由的取数，
        // 那些请求必须已经能读到「这是子账号会话」（刷新端点与 X-Shop-Id 都据此分流）
        setSessionKind("subaccount")
        tokenStore.set(accessToken)
        void navigate({ to: "/", replace: true })
    }

    // 进激活步骤才拉图形码：留在口令登录时它是一次没人看的匿名请求
    useEffect(() => {
        if (step === "activate") void refreshCaptcha()
    }, [step, refreshCaptcha])

    // 服务端错误渲染出来后把焦点移过去（role="alert" 已播报，聚焦便于键盘用户定位）
    useEffect(() => {
        if (submitError) serverErrorRef.current?.focus()
    }, [submitError])

    const serverErrorText = submitError ? errorText(submitError, locale) : undefined

    /** 发码：先验图（后端要求 captchaId + captchaCode 一起上报做人机验证） */
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
                // 链上的 then 必须返回值或抛（`promise/always-return`）：这条链的终点是 .finally，
                // 没有任何人读它的值，所以显式交回 undefined 而不是让规则去猜
                return undefined
            })
            .catch((error: unknown) => {
                const err = toApiError(error)
                setSubmitError(err)
                // 图形码类失败：换新图 + 清输入（其余错误保留原图，避免白打一次匿名接口）
                if (isCaptchaError(err)) {
                    resetCaptcha()
                    form.setFieldValue("captchaCode", "")
                }
                // 429 限频：服务端窗口就是 60s，命中时本地同样起倒计时（连点只会再撞一次限流）
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

                    {/* 登录名在激活步骤是只读的：它是我们刚拿到的那个名字，不是让用户重打一遍 */}
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
                                // 发码按钮：图形码留在这个表单里（不像店主表单那样收进浮层）——
                                // 激活是「填完这一整屏就走」的一次性流程，多一层浮层只是多一次点击
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
                                // 验证码图：点击换一张；加载/无图时占位
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
                        // 只对齐自己（`Button` 的间距归 Button 管，不在这里覆写 padding）
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
