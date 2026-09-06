import {
    type ApiError,
    ErrorCodes,
    SmsFormSchema,
    PasswordFormSchema,
    toApiError,
    PhoneSchema,
    PHONE_PATTERN,
} from "@shop/api"
import { notify } from "@shop/app-kit"
import {
    Button,
    cn,
    Dialog,
    DialogContent,
    DialogTitle,
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
import { QrCode, CircleAlert } from "lucide-react"
import { useState, useEffect } from "react"
import {
    getCaptcha,
    loginByPassword,
    loginBySms,
    sendSmsCode as sendSmsCodeAction,
} from "./actions"

type LoginTab = "sms" | "password"

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/** 提交/发码失败信息（detail 展示，code 决定交互分支），undefined = 无错误 */
type SubmitError = ApiError | undefined

/** 验证码类错误（输错/过期）：重新输入时自动清除并停掉抖动 */
function isCodeError(e: SubmitError): boolean {
    return e?.code === ErrorCodes.SMS_CODE_INVALID || e?.code === ErrorCodes.SMS_CODE_EXPIRED
}

/** 图形验证码类错误：发码失败后需刷新验证码图并让用户重输 */
function isCaptchaError(e: SubmitError): boolean {
    return (
        e?.code === ErrorCodes.CAPTCHA_REQUIRED ||
        e?.code === ErrorCodes.CAPTCHA_EXPIRED ||
        e?.code === ErrorCodes.CAPTCHA_INVALID
    )
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const [tab, setTab] = useState<LoginTab>("sms")
    // 服务端错误统一存一个状态；codeInvalid 由 code 推导，不再单独维护
    const [submitError, setSubmitError] = useState<SubmitError>()
    const [countdown, setCountdown] = useCountdown()
    // 图形验证码：挂载即加载（默认短信 tab 需要人机验证才能发码）。图在登录后随 dialog 关闭清理态
    const captcha = useCaptcha(getCaptcha)
    // useCaptcha 的 refresh 是 useCallback 稳定引用；提取出来供 useEffect 依赖数组用
    const refreshCaptcha = captcha.refresh

    const serverError = submitError?.detail ?? undefined
    const codeInvalid = isCodeError(submitError)
    const captchaInvalid = isCaptchaError(submitError)

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "", captchaCode: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            setSubmitError(undefined)
            try {
                if (tab === "sms") {
                    await loginBySms(value.phone, value.code)
                } else {
                    await loginByPassword(value.phone, value.password)
                }
                onOpenChange(false)
                form.reset()
                setTab("sms")
                setCountdown(0)
                notify.success("登录成功", "欢迎回来")
            } catch (error) {
                setSubmitError(toApiError(error))
            }
        },
    })

    // 发码是纯命令（无任何 query 缓存介入）：倒计时/验证码图/错误提示全是本地状态，
    // 不需要 useMutation；用 promise 链而非 try/finally（React Compiler 暂不支持 finally 块），.finally 兼顾 pending 复位。
    const [sendingCode, setSendingCode] = useState(false)
    function handleSendCode(phone: string) {
        setSendingCode(true)
        void sendSmsCodeAction(phone, {
            captchaId: captcha.captchaId,
            captchaCode: form.getFieldValue("captchaCode"),
        })
            .then(() => {
                setSubmitError(undefined)
                setCountdown(60)
                notify.success("验证码已发送")
                // 验证码 token 一次性：发码成功即换新图，下次发码需重新人机验证
                captcha.reset()
                form.setFieldValue("captchaCode", "")
            })
            .catch((error) => {
                const err = toApiError(error)
                setSubmitError(err)
                // 图形验证码类失败：刷新验证码图，引导用户重输（其余错误保留原图避免无谓请求）
                if (isCaptchaError(err)) {
                    captcha.reset()
                    form.setFieldValue("captchaCode", "")
                }
                notify.error(err.detail)
            })
            .finally(() => setSendingCode(false))
    }

    // 打开即加载图形验证码（默认短信 Tab 需先人机验证才能发码）；关闭时清理发送态
    // 依赖 refreshCaptcha（useCallback 稳定）而非整个 captcha 对象——后者每次 render 都是新引用，会无限触发刷新
    useEffect(() => {
        if (open) {
            void refreshCaptcha()
        }
    }, [open, refreshCaptcha])

    function switchTab(next: LoginTab) {
        setTab(next)
        setSubmitError(undefined)
        // 切到短信 Tab 时确保图形验证码图存在（避免发码按钮可用但无图）
        if (next === "sms" && !captcha.image) void captcha.refresh()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl">
                {/* 顶部品牌色环境光，打破纯平 */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-primary/8 to-transparent" />

                <div className="relative flex flex-col gap-7 p-8 pt-7">
                    <DialogTitle className="text-center tracking-tight">
                        登录后畅享更多功能
                    </DialogTitle>

                    <div className="flex items-stretch gap-8">
                        {/* 扫码登录占位（后端未支持，仅 UI 预留） */}
                        <div className="hidden w-56 flex-col items-center justify-center gap-4 sm:flex">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">扫码登录</p>
                                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                                    即将上线
                                </span>
                            </div>
                            <div className="relative flex size-44 items-center justify-center rounded-2xl bg-muted/70">
                                {/* 扫码框四角标记 */}
                                <span className="absolute left-0 top-0 size-4 rounded-tl-md border-l-2 border-t-2 border-foreground/30" />
                                <span className="absolute right-0 top-0 size-4 rounded-tr-md border-r-2 border-t-2 border-foreground/30" />
                                <span className="absolute bottom-0 left-0 size-4 rounded-bl-md border-b-2 border-l-2 border-foreground/30" />
                                <span className="absolute right-0 bottom-0 size-4 rounded-br-md border-b-2 border-r-2 border-foreground/30" />
                                <QrCode
                                    className="size-20 text-muted-foreground/50"
                                    strokeWidth={1.25}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">打开「Shop App」扫一扫</p>
                        </div>

                        {/* 两栏分割线：两端渐隐，弱化存在感 */}
                        <div className="hidden w-px bg-linear-to-b from-transparent via-foreground/10 to-transparent sm:block" />

                        {/* 表单区 */}
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
                                        <InputGroup className="h-12 rounded-xl border-0 bg-muted/70">
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
                                                    "h-12 rounded-xl border-0 bg-muted/70",
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
                                                        field.handleChange(
                                                            e.target.value.toUpperCase(),
                                                        )
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
                                                    onClick={() => void captcha.refresh()}
                                                    className="shrink-0 self-stretch border-l border-border/60"
                                                >
                                                    {captcha.image ? (
                                                        <img
                                                            src={captcha.image}
                                                            alt="图形验证码"
                                                            className="h-full w-26 rounded-r-xl"
                                                        />
                                                    ) : captcha.loading ? (
                                                        <Skeleton className="h-full w-26" />
                                                    ) : (
                                                        <span className="flex h-full w-26 items-center justify-center text-xs text-muted-foreground">
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
                                                    "h-12 rounded-xl border-0 bg-muted/70",
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
                                                        // 重新输入时只清验证码类错误（抖动随之消失），其余服务端错误保留到下次提交
                                                        setSubmitError((prev) =>
                                                            isCodeError(prev) ? undefined : prev,
                                                        )
                                                    }}
                                                />
                                                <form.Subscribe
                                                    selector={(s) => ({
                                                        phoneValid: PHONE_PATTERN.test(
                                                            s.values.phone,
                                                        ),
                                                        captchaValid:
                                                            s.values.captchaCode.length === 4,
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
                                                                handleSendCode(
                                                                    form.getFieldValue("phone"),
                                                                )
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
                                            <InputGroup className="h-12 rounded-xl border-0 bg-muted/70">
                                                <InputGroupInput
                                                    aria-label="密码"
                                                    type="password"
                                                    placeholder="请输入密码"
                                                    autoComplete="current-password"
                                                    value={field.state.value}
                                                    onBlur={field.handleBlur}
                                                    onChange={(e) =>
                                                        field.handleChange(e.target.value)
                                                    }
                                                />
                                            </InputGroup>
                                        </Field>
                                    )}
                                </form.AppField>
                            )}

                            {/* 服务端错误：预留高度，避免抖动 */}
                            <div className="min-h-4">
                                {serverError && (
                                    <p className="flex items-center gap-1.5 text-[13px] text-destructive">
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
                                        className="h-12 w-full"
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

                            <p className="text-center text-xs text-muted-foreground">
                                登录即代表同意
                                <Button
                                    variant="link"
                                    size="sm"
                                    className="mx-1 h-auto p-0"
                                >
                                    用户协议
                                </Button>
                                和
                                <Button
                                    variant="link"
                                    size="sm"
                                    className="mx-1 h-auto p-0"
                                >
                                    隐私政策
                                </Button>
                            </p>
                        </form>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
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
                "relative cursor-pointer pb-2 text-[15px] transition-colors duration-200",
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
