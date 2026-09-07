import {
    Button,
    Card,
    CardContent,
    Field,
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupText,
    Skeleton,
    Spinner,
    cn,
    firstFieldError,
    useAppForm,
    useCaptcha,
    useCountdown,
} from "@shop/ui-web"

import { authState, bootstrapAuth, getDeviceId, tokenStore } from "#/shared/lib/api"
import { AuthApi } from "@shop/api/sdk"
import {
    SmsFormSchema,
    PasswordFormSchema,
    toApiError,
    ErrorCodes,
    PhoneSchema,
    PHONE_PATTERN,
} from "@shop/common"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Store, CircleAlert } from "lucide-react"
import { useState, useEffect } from "react"

export const Route = createFileRoute("/login")({
    component: LoginPage,
})

type LoginTab = "sms" | "password"

function LoginPage() {
    const navigate = useNavigate()
    const [tab, setTab] = useState<LoginTab>("sms")
    const [serverError, setServerError] = useState<string | undefined>()
    const [codeInvalid, setCodeInvalid] = useState(false)
    const [captchaInvalid, setCaptchaInvalid] = useState(false)
    const [countdown, setCountdown] = useCountdown()
    // 图形验证码：发码前先过人机验证（对应后端 infra/captcha）
    const captcha = useCaptcha(AuthApi.getCaptcha)

    // 已登录（refresh cookie 有效）直接进入工作台
    useEffect(() => {
        void (async () => {
            await bootstrapAuth()
            if (authState.getStatus() === "authed") {
                await navigate({ to: "/", replace: true })
            }
        })()
    }, [navigate])

    // 页面挂载默认短信 Tab：加载图形验证码（发码前先过人机验证）
    useEffect(() => {
        void captcha.refresh()
        // captcha 实例稳定（useCallback 包裹的 getCaptcha），仅在挂载时触发一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "", captchaCode: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            setServerError(undefined)
            setCodeInvalid(false)
            try {
                const result =
                    tab === "sms"
                        ? await AuthApi.loginBySms({
                              body: {
                                  phone: value.phone,
                                  code: value.code,
                                  deviceId: getDeviceId(),
                              },
                          })
                        : await AuthApi.loginByPassword({
                              body: {
                                  phone: value.phone,
                                  password: value.password,
                                  deviceId: getDeviceId(),
                              },
                          })
                tokenStore.set(result.accessToken)
                void navigate({ to: "/", replace: true })
            } catch (error) {
                const err = toApiError(error)
                // 登录失败对外统一文案（后端刻意不暴露「未设密码」以反账号枚举）
                setServerError(err.detail)
                setCodeInvalid(
                    err.code === ErrorCodes.SMS_CODE_INVALID ||
                        err.code === ErrorCodes.SMS_CODE_EXPIRED,
                )
            }
        },
    })

    // 发码是纯命令（无任何 query 缓存介入）：倒计时/验证码图/错误提示全是本地状态，
    // 不需要 useMutation；用 promise 链而非 try/finally（React Compiler 暂不支持 finally 块），.finally 兼顾 pending 复位。
    const [sendingCode, setSendingCode] = useState(false)
    function sendCode(phone: string) {
        setSendingCode(true)
        void AuthApi.sendSmsCode({
            body: {
                phone,
                captchaId: captcha.captchaId,
                captchaCode: form.getFieldValue("captchaCode"),
            },
        })
            .then(() => {
                setServerError(undefined)
                setCountdown(60)
                setCaptchaInvalid(false)
                // 验证码 token 一次性：发码成功换新图
                captcha.reset()
                form.setFieldValue("captchaCode", "")
            })
            .catch((error) => {
                const err = toApiError(error)
                setServerError(err.detail)
                const isCaptchaErr =
                    err.code === ErrorCodes.CAPTCHA_REQUIRED ||
                    err.code === ErrorCodes.CAPTCHA_EXPIRED ||
                    err.code === ErrorCodes.CAPTCHA_INVALID
                setCaptchaInvalid(isCaptchaErr)
                // 图形验证码类失败：刷新图并清空输入
                if (isCaptchaErr) {
                    captcha.reset()
                    form.setFieldValue("captchaCode", "")
                }
            })
            .finally(() => setSendingCode(false))
    }

    function switchTab(next: LoginTab) {
        setTab(next)
        setServerError(undefined)
        setCodeInvalid(false)
        // 切到短信 Tab 时确保验证码图存在（default sms tab 挂载即加载）
        if (next === "sms" && !captcha.image) void captcha.refresh()
    }

    return (
        <div className="flex min-h-dvh items-center justify-center bg-sunken px-4">
            <Card className="w-full max-w-sm">
                <CardContent className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <Store className="size-5" />
                        </div>
                        <h1 className="text-lg font-semibold tracking-tight">登录卖家中心</h1>
                    </div>

                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void form.handleSubmit()
                        }}
                    >
                        <div className="flex gap-6">
                            <TabButton
                                active={tab === "sms"}
                                onClick={() => switchTab("sms")}
                            >
                                验证码登录
                            </TabButton>
                            <TabButton
                                active={tab === "password"}
                                onClick={() => switchTab("password")}
                            >
                                密码登录
                            </TabButton>
                        </div>

                        <form.AppField
                            name="phone"
                            validators={{ onChange: PhoneSchema }}
                        >
                            {(field) => (
                                <Field error={firstFieldError(field)}>
                                    <InputGroup className="h-11 rounded-xl border-0 bg-muted/70">
                                        <InputGroupAddon align="inline-start">
                                            <InputGroupText className="px-3.5 tabular-nums">
                                                +86
                                            </InputGroupText>
                                        </InputGroupAddon>
                                        <InputGroupInput
                                            aria-label="手机号"
                                            className="tracking-wide tabular-nums placeholder:tracking-normal"
                                            placeholder="请输入手机号"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            maxLength={11}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) =>
                                                field.handleChange(
                                                    e.target.value.replaceAll(/\D/g, ""),
                                                )
                                            }
                                        />
                                    </InputGroup>
                                </Field>
                            )}
                        </form.AppField>

                        {tab === "sms" ? (
                            /* 图形验证码：发码前先人机验证（点击图片刷新） */
                            <form.AppField name="captchaCode">
                                {(field) => (
                                    <Field error={firstFieldError(field)}>
                                        <InputGroup
                                            className={cn(
                                                "h-11 rounded-xl border-0 bg-muted/70",
                                                captchaInvalid &&
                                                    "animate-shake ring-2 ring-destructive/40",
                                            )}
                                        >
                                            <InputGroupInput
                                                aria-label="图形验证码"
                                                className="px-3.5 tracking-widest uppercase placeholder:normal-case placeholder:tracking-normal"
                                                placeholder="图形验证码"
                                                autoComplete="off"
                                                maxLength={4}
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => {
                                                    field.handleChange(e.target.value.toUpperCase())
                                                    setCaptchaInvalid(false)
                                                }}
                                            />
                                            <button
                                                type="button"
                                                aria-label="刷新图形验证码"
                                                onClick={() => void captcha.refresh()}
                                                className="shrink-0 self-stretch border-l border-border/60"
                                            >
                                                {captcha.image ? (
                                                    <img
                                                        src={captcha.image}
                                                        alt="图形验证码"
                                                        className="h-full w-24 rounded-r-xl"
                                                    />
                                                ) : captcha.loading ? (
                                                    <Skeleton className="h-full w-24" />
                                                ) : (
                                                    <span className="flex h-full w-24 items-center justify-center text-xs text-muted-foreground">
                                                        点击获取
                                                    </span>
                                                )}
                                            </button>
                                        </InputGroup>
                                    </Field>
                                )}
                            </form.AppField>
                        ) : undefined}

                        {tab === "sms" ? (
                            <form.AppField name="code">
                                {(field) => (
                                    <Field error={firstFieldError(field)}>
                                        <InputGroup
                                            className={cn(
                                                "h-11 rounded-xl border-0 bg-muted/70",
                                                codeInvalid &&
                                                    "animate-shake ring-2 ring-destructive/40",
                                            )}
                                        >
                                            <InputGroupInput
                                                aria-label="短信验证码"
                                                className="px-3.5 tracking-widest tabular-nums placeholder:tracking-normal"
                                                placeholder="请输入验证码"
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
                                                maxLength={6}
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => {
                                                    field.handleChange(
                                                        e.target.value.replaceAll(/\D/g, ""),
                                                    )
                                                    setCodeInvalid(false)
                                                }}
                                            />
                                            <form.Subscribe
                                                selector={(s) => ({
                                                    phoneValid: PHONE_PATTERN.test(s.values.phone),
                                                    captchaValid: s.values.captchaCode.length === 4,
                                                })}
                                            >
                                                {({ phoneValid, captchaValid }) => (
                                                    <InputGroupButton
                                                        variant="link"
                                                        size="sm"
                                                        className="h-full shrink-0 px-3.5 disabled:opacity-40"
                                                        disabled={
                                                            !phoneValid ||
                                                            !captchaValid ||
                                                            !captcha.image ||
                                                            countdown > 0 ||
                                                            sendingCode
                                                        }
                                                        onClick={() =>
                                                            sendCode(form.getFieldValue("phone"))
                                                        }
                                                    >
                                                        {countdown > 0 ? (
                                                            <span className="tabular-nums">
                                                                {countdown}s 后重发
                                                            </span>
                                                        ) : sendingCode ? (
                                                            <Spinner />
                                                        ) : (
                                                            "获取验证码"
                                                        )}
                                                    </InputGroupButton>
                                                )}
                                            </form.Subscribe>
                                        </InputGroup>
                                    </Field>
                                )}
                            </form.AppField>
                        ) : (
                            <form.AppField name="password">
                                {(field) => (
                                    <Field error={firstFieldError(field)}>
                                        <InputGroup className="h-11 rounded-xl border-0 bg-muted/70">
                                            <InputGroupInput
                                                aria-label="密码"
                                                type="password"
                                                placeholder="请输入密码"
                                                autoComplete="current-password"
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => field.handleChange(e.target.value)}
                                            />
                                        </InputGroup>
                                    </Field>
                                )}
                            </form.AppField>
                        )}

                        <div className="min-h-4">
                            {serverError && (
                                <p className="flex items-center gap-1.5 text-2xs text-destructive">
                                    <CircleAlert className="size-3.5 shrink-0" />
                                    {serverError}
                                </p>
                            )}
                        </div>

                        <form.Subscribe
                            selector={(state) => ({
                                isSubmitting: state.isSubmitting,
                                ready:
                                    PHONE_PATTERN.test(state.values.phone) &&
                                    (tab === "sms"
                                        ? state.values.code.length === 6
                                        : state.values.password.length >= 8),
                            })}
                        >
                            {({ isSubmitting, ready }) => (
                                <Button
                                    type="submit"
                                    variant="cta"
                                    className="h-11 w-full"
                                    disabled={!ready || isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Spinner />
                                            登录
                                        </>
                                    ) : (
                                        "登录"
                                    )}
                                </Button>
                            )}
                        </form.Subscribe>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            className={cn(
                "relative cursor-pointer pb-2 text-base transition-colors duration-200",
                active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
            )}
            onClick={onClick}
        >
            {children}
            <span
                className={cn(
                    "absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-foreground transition-opacity duration-200",
                    active ? "opacity-100" : "opacity-0",
                )}
            />
        </button>
    )
}
