import { useEffect, useState } from "react"
import { CircleAlert } from "lucide-react"

import {
    type ApiError,
    ErrorCodes,
    PasswordFormSchema,
    PHONE_PATTERN,
    PhoneSchema,
    SmsFormSchema,
    toApiError,
} from "@shop/common"
import {
    Button,
    cn,
    Field,
    firstFieldError,
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupText,
    Skeleton,
    Spinner,
    useAppForm,
    useCaptcha,
    useCountdown,
} from "@shop/ui-web"

import { notify } from "./notify"

/**
 * LoginForm —— 短信/密码双 Tab 登录表单（web 弹窗与 seller 登录页共用的应用层组件）。
 *
 * 为什么在 app-kit：它同时知道契约（SmsFormSchema / ApiError 错误码语义）与 UI（ui-web 控件），
 * 且「输错验证码抖动、图形验证码失效换图、发码倒计时」这套交互两端必须一致 —— 正是 app-kit
 * 的职责边界（同 notify 的文案策略）。端差异只留两处入参：动作装配（getCaptcha/sendCode/submit）
 * 与壳（web 是 Dialog + 扫码占位，seller 是 Card）。
 *
 * 自有状态全部是表单瞬时态：Tab、服务端错误、倒计时、发码中、图形验证码。
 * 登录态写入（tokenStore）与跳转/关闭弹窗由调用方在 submit / onSuccess 里做。
 */

export type LoginTab = "sms" | "password"

export interface LoginFormProps {
    /** 拉取图形验证码（web 走 server action，seller 走 SDK） */
    getCaptcha: () => Promise<{ captchaId: string; image: string }>
    /** 发送短信验证码（captchaId + captchaCode 一起上报做人机验证） */
    sendCode: (input: { phone: string; captchaId: string; captchaCode: string }) => Promise<void>
    /** 提交登录：tab 决定读 code 还是 password */
    submit: (input: {
        tab: LoginTab
        phone: string
        code: string
        password: string
    }) => Promise<void>
    /** 登录成功后的收尾（关闭弹窗 / 跳转工作台） */
    onSuccess: () => void
    /** 表单是否可见：false→true 时刷新图形验证码（弹窗场景传入；页面场景默认常显） */
    active?: boolean
    /** 控件尺寸：md = C 端弹窗，sm = B 端卡片 */
    size?: "sm" | "md"
    /** 表单底部附加内容（协议文案等） */
    footer?: React.ReactNode
}

/** 验证码类错误（输错/过期）：重新输入时自动清除并停掉抖动 */
function isCodeError(e: ApiError | undefined): boolean {
    return e?.code === ErrorCodes.SMS_CODE_INVALID || e?.code === ErrorCodes.SMS_CODE_EXPIRED
}

/** 图形验证码类错误：发码失败后需刷新验证码图并让用户重输 */
function isCaptchaError(e: ApiError | undefined): boolean {
    return (
        e?.code === ErrorCodes.CAPTCHA_REQUIRED ||
        e?.code === ErrorCodes.CAPTCHA_EXPIRED ||
        e?.code === ErrorCodes.CAPTCHA_INVALID
    )
}

/** 尺寸只差控件高度与验证码图宽度，用查表而不是 boolean 分支散落各处 */
const SIZES = {
    md: { control: "h-12", captcha: "w-26" },
    sm: { control: "h-11", captcha: "w-24" },
} as const

export function LoginForm({
    getCaptcha,
    sendCode,
    submit,
    onSuccess,
    active = true,
    size = "md",
    footer,
}: LoginFormProps) {
    const [tab, setTab] = useState<LoginTab>("sms")
    // 服务端错误统一存一个状态；codeInvalid / captchaInvalid 由 code 推导，不另立状态
    const [submitError, setSubmitError] = useState<ApiError>()
    const [countdown, setCountdown] = useCountdown()
    const [sendingCode, setSendingCode] = useState(false)
    const captcha = useCaptcha(getCaptcha)
    // useCaptcha 的 refresh/reset 都是 useCallback 稳定引用；提取出来供依赖数组与回调使用
    const { refresh: refreshCaptcha, reset: resetCaptcha } = captcha

    const { control, captcha: captchaWidth } = SIZES[size]
    const serverError = submitError?.detail
    const codeInvalid = isCodeError(submitError)
    const captchaInvalid = isCaptchaError(submitError)

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "", captchaCode: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            setSubmitError(undefined)
            try {
                await submit({
                    tab,
                    phone: value.phone,
                    code: value.code,
                    password: value.password,
                })
                form.reset()
                setTab("sms")
                setCountdown(0)
                notify.success("登录成功", "欢迎回来")
                onSuccess()
            } catch (error) {
                setSubmitError(toApiError(error))
            }
        },
    })

    // 发码是纯命令（无任何 query 缓存介入）：倒计时/验证码图/错误提示全是本地状态，
    // 不需要 useMutation；用 promise 链而非 try/finally（React Compiler 暂不支持 finally 块）。
    function handleSendCode() {
        setSendingCode(true)
        void sendCode({
            phone: form.getFieldValue("phone"),
            captchaId: captcha.captchaId,
            captchaCode: form.getFieldValue("captchaCode"),
        })
            .then(() => {
                setSubmitError(undefined)
                setCountdown(60)
                notify.success("验证码已发送")
                // 验证码 token 一次性：发码成功即换新图，下次发码需重新人机验证
                resetCaptcha()
                form.setFieldValue("captchaCode", "")
            })
            .catch((error) => {
                const err = toApiError(error)
                setSubmitError(err)
                // 图形验证码类失败：刷新验证码图，引导用户重输（其余错误保留原图避免无谓请求）
                if (isCaptchaError(err)) {
                    resetCaptcha()
                    form.setFieldValue("captchaCode", "")
                }
                notify.error(err.detail)
            })
            .finally(() => setSendingCode(false))
    }

    // 显现即加载图形验证码（短信 Tab 需先人机验证才能发码）
    useEffect(() => {
        if (active) void refreshCaptcha()
    }, [active, refreshCaptcha])

    function switchTab(next: LoginTab) {
        setTab(next)
        setSubmitError(undefined)
        // 切到短信 Tab 时确保图形验证码图存在（避免发码按钮可用但无图）
        if (next === "sms" && !captcha.image) void refreshCaptcha()
    }

    return (
        <form
            className="flex min-w-0 flex-1 flex-col gap-4"
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

            {/* 手机号 */}
            <form.AppField
                name="phone"
                validators={{ onChange: PhoneSchema }}
            >
                {(field) => (
                    <Field error={firstFieldError(field)}>
                        <InputGroup className={cn(control, "rounded-xl border-0 bg-muted/70")}>
                            <InputGroupAddon align="inline-start">
                                <InputGroupText className="px-3.5 tabular-nums">+86</InputGroupText>
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
                                    field.handleChange(e.target.value.replaceAll(/\D/g, ""))
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
                                    control,
                                    "rounded-xl border-0 bg-muted/70",
                                    captchaInvalid && "animate-shake ring-2 ring-destructive/40",
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
                                        // 重新输入时只清验证码类错误，其余保留到下次提交
                                        setSubmitError((prev) =>
                                            isCaptchaError(prev) ? undefined : prev,
                                        )
                                    }}
                                />
                                {/* 验证码图：点击刷新；加载/无图时占位 */}
                                <button
                                    type="button"
                                    aria-label="刷新图形验证码"
                                    onClick={() => void refreshCaptcha()}
                                    className="shrink-0 self-stretch border-l border-border/60"
                                >
                                    {captcha.image ? (
                                        <img
                                            src={captcha.image}
                                            alt="图形验证码"
                                            className={cn("h-full rounded-r-xl", captchaWidth)}
                                        />
                                    ) : captcha.loading ? (
                                        <Skeleton className={cn("h-full", captchaWidth)} />
                                    ) : (
                                        <span
                                            className={cn(
                                                "flex h-full items-center justify-center text-xs text-muted-foreground",
                                                captchaWidth,
                                            )}
                                        >
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
                /* 验证码 + 内嵌发送按钮 */
                <form.AppField name="code">
                    {(field) => (
                        <Field error={firstFieldError(field)}>
                            <InputGroup
                                className={cn(
                                    control,
                                    "rounded-xl border-0 bg-muted/70",
                                    codeInvalid && "animate-shake ring-2 ring-destructive/40",
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
                                        field.handleChange(e.target.value.replaceAll(/\D/g, ""))
                                        // 重新输入时只清验证码类错误（抖动随之消失），其余服务端错误保留到下次提交
                                        setSubmitError((prev) =>
                                            isCodeError(prev) ? undefined : prev,
                                        )
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
                                            onClick={handleSendCode}
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
                            <InputGroup className={cn(control, "rounded-xl border-0 bg-muted/70")}>
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

            {/* 服务端错误：预留高度，避免抖动 */}
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
                        className={cn(control, "w-full")}
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

            {footer}
        </form>
    )
}

/** Tab 切换按钮：激活项加粗并带下划线指示条 */
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
