import { useEffect, useReducer, useRef, useState } from "react"

import { type ApiError, ErrorCodes, toApiError } from "@shop/common"
import {
    Button,
    cn,
    Field,
    FieldError,
    FormError,
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    PasswordToggle,
    PhoneField,
    Skeleton,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "./i18n"
import { notify } from "./notify"
import {
    CAPTCHA_CODE_DIGITS,
    PHONE_PATTERN,
    PasswordFormSchema,
    SMS_CODE_DIGITS,
    SmsFormSchema,
} from "./login-schema"
import { usePasswordVisibility } from "./use-password-visibility"
import { useCaptcha } from "./use-captcha"
import { useCountdown } from "./use-countdown"

/**
 * LoginForm —— 短信/密码双 Tab 登录表单（web 弹窗与 seller 登录页共用的应用层组件）。
 *
 * 为什么在 app-kit：它同时知道契约（SmsFormSchema / ApiError 错误码语义）与 UI（ui-web 控件），
 * 且「输错验证码抖动、图形验证码失效换图、发码倒计时」这套交互两端必须一致 —— 正是 app-kit
 * 的职责边界。端差异只留两处入参：动作装配（getCaptcha/sendCode/submit）
 * 与壳（web 是 Dialog + 扫码占位，seller 是 Card）。
 *
 * 自有状态全部是表单瞬时态：Tab、服务端错误、倒计时、发码中、图形验证码。
 * 登录态写入（tokenStore）与跳转/关闭弹窗由调用方在 submit / onSuccess 里做。
 */

type LoginTab = "sms" | "password"

export interface LoginFormProps {
    /** 拉取图形验证码（web 走 server action，seller 走 SDK）。**引用必须稳定**：传模块级函数，不要传行内闭包 */
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

/** 表单控件统一尺寸（B 端紧凑档）：控件高 44px（h-11）、验证码图宽 96px（w-24）。
 *  以前按端查表分 sm/md 两档，但两档只差 4px/8px，为它维护一张查表 + 一个 size prop
 *  不划算，也挡住了 lint 对类名的检查（require-static-classes 读不到查表里的变量）。
 *  类名一律就地写成字面量，别再收敛回常量——收敛回去规则就又看不见了 */

/** Tab 切换/错误清除/提交失败是联动状态机，收进一个 reducer，避免多处 setState 各自为政 */
interface LoginUiState {
    tab: LoginTab
    submitError?: ApiError
    submitFailCount: number
}
type LoginUiAction =
    | { type: "switchTab"; tab: LoginTab }
    | { type: "submitStarted" }
    | { type: "submitFailed"; error: ApiError }
    | { type: "submitSucceeded" }
    | { type: "sendCodeFailed"; error: ApiError }
    | { type: "sendCodeSucceeded" }
    /** 重新输入图形验证码：只清验证码类错误，其余保留到下次提交 */
    | { type: "dismissCaptchaError" }
    /** 重新输入短信验证码：只清发码类错误（抖动随之消失） */
    | { type: "dismissCodeError" }

// fallow-ignore-next-line complexity
function loginUiReducer(state: LoginUiState, action: LoginUiAction): LoginUiState {
    switch (action.type) {
        case "switchTab":
            return { ...state, tab: action.tab, submitError: undefined }
        case "submitStarted":
            return { ...state, submitError: undefined }
        case "submitFailed":
            return {
                ...state,
                submitError: action.error,
                submitFailCount: state.submitFailCount + 1,
            }
        case "submitSucceeded":
            return { tab: "sms", submitError: undefined, submitFailCount: state.submitFailCount }
        case "sendCodeFailed":
            // 发码失败不动 failCount：错误提示不触发「聚焦错误节点」的提交语义
            return { ...state, submitError: action.error }
        case "sendCodeSucceeded":
            return { ...state, submitError: undefined }
        case "dismissCaptchaError":
            return isCaptchaError(state.submitError) ? { ...state, submitError: undefined } : state
        case "dismissCodeError":
            return isCodeError(state.submitError) ? { ...state, submitError: undefined } : state
    }
}

// oxlint-disable-next-line react-doctor/no-giant-component -- TanStack Form 的 AppField 渲染 prop 结构决定行数（每字段 30-60 行）；抽子组件需传 form 实例与 6+ 回调，接口更宽，违背高内聚
export function LoginForm({
    getCaptcha,
    sendCode,
    submit,
    onSuccess,
    active = true,
    footer,
}: LoginFormProps) {
    const t = useT()
    const [ui, dispatch] = useReducer(loginUiReducer, {
        tab: "sms",
        submitFailCount: 0,
    })
    const { tab, submitError, submitFailCount } = ui
    const serverErrorRef = useRef<HTMLParagraphElement>(null)
    const [countdown, setCountdown] = useCountdown()
    const [sendingCode, setSendingCode] = useState(false)
    const captcha = useCaptcha(getCaptcha)
    // refresh/reset 的稳定性来自入参 getCaptcha 的稳定性（useCaptcha 把它放进了 useCallback 依赖），
    // 所以调用方必须传模块级函数——传行内闭包会让下面「显现即拉验证码」的 effect 每渲染打一次后端
    const { refresh: refreshCaptcha, reset: resetCaptcha } = captcha

    const serverError = submitError?.detail
    const codeInvalid = isCodeError(submitError)
    const captchaInvalid = isCaptchaError(submitError)

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "", captchaCode: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            dispatch({ type: "submitStarted" })
            try {
                await submit({
                    tab,
                    phone: value.phone,
                    code: value.code,
                    password: value.password,
                })
                form.reset()
                dispatch({ type: "submitSucceeded" })
                setCountdown(0)
                notify.success(t("appKit.login.successTitle"), t("appKit.login.successDescription"))
                onSuccess()
            } catch (error) {
                dispatch({ type: "submitFailed", error: toApiError(error) })
            }
        },
        // 校验失败：焦点移到第一个报错字段（aria-invalid 由下方 InputGroupInput 承接）
        onSubmitInvalid: ({ formApi }) => {
            const order =
                tab === "sms"
                    ? (["phone", "captchaCode", "code"] as const)
                    : (["phone", "password"] as const)
            for (const name of order) {
                if ((formApi.getFieldMeta(name)?.errors.length ?? 0) > 0) {
                    document.getElementById(`login-${name}`)?.focus()
                    return
                }
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
                dispatch({ type: "sendCodeSucceeded" })
                setCountdown(60)
                notify.success(t("appKit.login.codeSent"))
                // 验证码 token 一次性：发码成功即换新图，下次发码需重新人机验证
                resetCaptcha()
                form.setFieldValue("captchaCode", "")
                return undefined
            })
            .catch((error) => {
                const err = toApiError(error)
                dispatch({ type: "sendCodeFailed", error: err })
                // 图形验证码类失败：刷新验证码图，引导用户重输（其余错误保留原图避免无谓请求）
                if (isCaptchaError(err)) {
                    resetCaptcha()
                    form.setFieldValue("captchaCode", "")
                }
                // 429 限频（SMS_RATE_LIMIT）：服务端窗口就是 60s，命中时本地同样起倒计时——
                // 连点只会再撞一次限流，倒计时无损失地兜住（发码成功的本地倒计时逻辑不变）
                if (err.status === 429 && err.code === ErrorCodes.SMS_RATE_LIMIT) {
                    setCountdown(60)
                }
                notify.error(err.detail)
            })
            .finally(() => setSendingCode(false))
    }

    // 显现即加载图形验证码（短信 Tab 需先人机验证才能发码）
    useEffect(() => {
        if (active) void refreshCaptcha()
    }, [active, refreshCaptcha])

    // 提交失败：服务端错误节点渲染后把焦点移过去（role="alert" 已播报，聚焦便于键盘用户定位）
    useEffect(() => {
        if (submitFailCount > 0) serverErrorRef.current?.focus()
    }, [submitFailCount])

    function switchTab(next: LoginTab) {
        dispatch({ type: "switchTab", tab: next })
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
                    {t("appKit.login.smsTab")}
                </TabButton>
                <TabButton
                    active={tab === "password"}
                    onClick={() => switchTab("password")}
                >
                    {t("appKit.login.passwordTab")}
                </TabButton>
            </div>

            {/* 手机号：项目的 PhoneField（filled 皮肤 + 固定 +86 前缀，号码元数据做实时校验）。
                值仍是裸 11 位，与契约（/^1[3-9]\d{9}$/）一致，不引入 reui 的国际 E.164
                形态与国旗触发器。 */}
            <form.AppField name="phone">
                {(field) => (
                    <Field>
                        <PhoneField
                            id="login-phone"
                            value={field.state.value}
                            onChange={field.handleChange}
                            onBlur={field.handleBlur}
                            invalid={!field.state.meta.isValid}
                        />
                        <FieldError errors={field.state.meta.errors} />
                    </Field>
                )}
            </form.AppField>

            {tab === "sms" ? (
                /* 图形验证码：发码前先人机验证（点击图片刷新） */
                <form.AppField name="captchaCode">
                    {(field) => (
                        <Field>
                            <InputGroup
                                size="lg"
                                variant="filled"
                                invalid={captchaInvalid}
                            >
                                <InputGroupInput
                                    id="login-captchaCode"
                                    aria-label={t("appKit.login.captchaLabel")}
                                    aria-invalid={!field.state.meta.isValid}
                                    variant="code"
                                    className="px-3.5"
                                    placeholder={t("appKit.login.captchaPlaceholder")}
                                    autoComplete="off"
                                    maxLength={CAPTCHA_CODE_DIGITS}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => {
                                        field.handleChange(e.target.value.toUpperCase())
                                        // 重新输入时只清验证码类错误，其余保留到下次提交
                                        dispatch({ type: "dismissCaptchaError" })
                                    }}
                                />
                                {/* 验证码图：点击刷新；加载/无图时占位 */}
                                <button
                                    type="button"
                                    aria-label={t("appKit.login.captchaRefresh")}
                                    onClick={() => void refreshCaptcha()}
                                    className="shrink-0 self-stretch border-l border-border/60"
                                >
                                    {captcha.image ? (
                                        <img
                                            src={captcha.image}
                                            alt={t("appKit.login.captchaAlt")}
                                            className="h-full w-24 rounded-r-xl"
                                        />
                                    ) : captcha.loading ? (
                                        <Skeleton className="h-full w-24" />
                                    ) : (
                                        <span className="flex h-full w-24 items-center justify-center text-xs text-muted-foreground">
                                            {t("appKit.login.captchaClick")}
                                        </span>
                                    )}
                                </button>
                            </InputGroup>
                            <FieldError errors={field.state.meta.errors} />
                        </Field>
                    )}
                </form.AppField>
            ) : undefined}

            {tab === "sms" ? (
                /* 验证码 + 内嵌发送按钮 */
                <form.AppField name="code">
                    {(field) => (
                        <Field>
                            <InputGroup
                                size="lg"
                                variant="filled"
                                invalid={codeInvalid}
                            >
                                <InputGroupInput
                                    id="login-code"
                                    aria-label={t("appKit.login.smsCodeLabel")}
                                    aria-invalid={!field.state.meta.isValid}
                                    variant="code"
                                    className="px-3.5 tabular-nums"
                                    placeholder={t("appKit.login.smsCodePlaceholder")}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={SMS_CODE_DIGITS}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => {
                                        field.handleChange(e.target.value.replaceAll(/\D/g, ""))
                                        // 重新输入时只清验证码类错误（抖动随之消失），其余服务端错误保留到下次提交
                                        dispatch({ type: "dismissCodeError" })
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
                                            className="h-full shrink-0 px-3.5"
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
                                                    {t("appKit.login.resend", { countdown })}
                                                </span>
                                            ) : sendingCode ? (
                                                <Spinner />
                                            ) : (
                                                t("appKit.login.sendCode")
                                            )}
                                        </InputGroupButton>
                                    )}
                                </form.Subscribe>
                            </InputGroup>
                            <FieldError errors={field.state.meta.errors} />
                        </Field>
                    )}
                </form.AppField>
            ) : (
                <form.AppField name="password">
                    {(field) => (
                        <PasswordField
                            field={field}
                            label={t("appKit.login.passwordLabel")}
                            placeholder={t("appKit.login.passwordPlaceholder")}
                        />
                    )}
                </form.AppField>
            )}

            {/* 服务端错误：预留高度，避免抖动；role="alert" 播报 + 提交失败时聚焦 */}
            <div className="min-h-4">
                <FormError
                    ref={serverErrorRef}
                    tabIndex={-1}
                >
                    {serverError}
                </FormError>
            </div>

            <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                {({ isSubmitting }) => (
                    <Button
                        type="submit"
                        variant="cta"
                        className="h-11 w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Spinner />}
                        {t("appKit.login.submit")}
                    </Button>
                )}
            </form.Subscribe>

            {footer}
        </form>
    )
}

/** AppField render prop 里不能调 hook（显隐状态是 React state），所以密码字段抽成真组件。
    `field` 只用到这几个成员，用结构化类型声明，app-kit 不直接依赖 @tanstack/react-form */
type PasswordFieldApi = {
    state: {
        value: string
        meta: { errors: ReadonlyArray<unknown>; isValid: boolean }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
}

/** 密码字段：filled 皮肤的 InputGroup + 尾端一颗小眼睛（位置交给 InputGroupAddon） */
function PasswordField({
    field,
    label,
    placeholder,
}: {
    field: PasswordFieldApi
    label: string
    placeholder: string
}) {
    const password = usePasswordVisibility()
    return (
        <Field>
            <InputGroup
                size="lg"
                variant="filled"
            >
                <InputGroupInput
                    id="login-password"
                    aria-label={label}
                    aria-invalid={!field.state.meta.isValid}
                    type={password.inputType}
                    placeholder={placeholder}
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                    <PasswordToggle {...password.toggleProps} />
                </InputGroupAddon>
            </InputGroup>
            <FieldError errors={field.state.meta.errors} />
        </Field>
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
