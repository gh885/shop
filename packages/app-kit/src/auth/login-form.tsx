import { appKitMessage } from "../i18n/message"
import { useEffect, useReducer, useRef, useState } from "react"

import type { Captcha, SmsCodeRequest } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
import {
    Button,
    Field,
    FieldError,
    FormError,
    InputGroup,
    InputGroupButton,
    InputGroupInput,
    PhoneField,
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
    Skeleton,
    Spinner,
    Tabs,
    TabsList,
    TabsTrigger,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useI18n, useT } from "../i18n"
import { errorText } from "../i18n/error-keys"
import { notify } from "../data/notify"
import { serverFieldErrors } from "../forms/server-field-errors"
import { submitForm } from "../forms/submit-form"
import { PasswordField, SubmitButton } from "./fields"
import {
    CAPTCHA_CODE_DIGITS,
    PHONE_PATTERN,
    PasswordFormSchema,
    SMS_CODE_DIGITS,
    SmsFormSchema,
} from "./login-schema"
import { useCaptcha } from "./use-captcha"
import { useCountdown } from "./use-countdown"
import {
    isCaptchaCodeComplete,
    isCaptchaError,
    isCodeError,
    isSmsRateLimit,
    loginUiReducer,
    type LoginTab,
    RESEND_COUNTDOWN_SECONDS,
} from "./login-ui"

/**
 * LoginForm —— 短信/密码双 Tab 登录表单（web 弹窗与 seller 登录页共用）。端差异只留两处入参：
 * 动作装配（getCaptcha/sendCode/submit）与壳（web 是 Dialog，seller 是 Card）；登录态写入与跳转由调用方在 onSuccess 里做。
 */

export interface LoginFormProps {
    /** 拉取图形验证码（web 走 server action，seller 走 SDK）。**引用必须稳定**：传模块级函数，不要传行内闭包 */
    getCaptcha: () => Promise<Captcha>
    /** 发送短信验证码（captchaId + captchaCode 一起上报做人机验证） */
    sendCode: (input: SmsCodeRequest) => Promise<void>
    /** 提交登录：tab 决定读 code 还是 password */
    submit: (input: {
        tab: LoginTab
        phone: string
        code: string
        password: string
    }) => Promise<void>
    /** 登录成功后的收尾（关闭弹窗 / 跳转工作台） */
    onSuccess: () => void
    footer?: React.ReactNode
}

// 表单控件统一尺寸（h-11、验证码图 w-24）：类名一律就地写成字面量，别再收敛回常量——
// 收敛后 require-static-classes 这条 lint 就看不到类名了。

// oxlint-disable-next-line react-doctor/no-giant-component -- TanStack Form 的 AppField 渲染 prop 结构决定行数（每字段 30-60 行）；抽子组件需传 form 实例与 6+ 回调，接口更宽，违背高内聚
export function LoginForm({ getCaptcha, sendCode, submit, onSuccess, footer }: LoginFormProps) {
    const t = useT()
    const { locale } = useI18n()
    const [ui, dispatch] = useReducer(loginUiReducer, {
        tab: "sms",
        submitFailCount: 0,
    })
    const { tab, submitError, submitFailCount } = ui
    const serverErrorRef = useRef<HTMLParagraphElement>(null)
    /** 验证码那一整行的 DOM 节点：人机验证浮层要按它展开，见下面 PopoverContent 的 anchor */
    const codeRowRef = useRef<HTMLDivElement>(null)
    const [countdown, setCountdown] = useCountdown()
    const [sendingCode, setSendingCode] = useState(false)
    const captcha = useCaptcha(getCaptcha)
    // refresh/reset 的稳定性来自入参 getCaptcha：调用方必须传模块级函数，传行内闭包会让拉图 effect 每渲染打一次后端
    const { refresh: refreshCaptcha, reset: resetCaptcha, clear: clearCaptcha } = captcha
    const [captchaOpen, setCaptchaOpen] = useState(false)

    // 内联那条与全局 toast 走同一条链（§7.3）：命中 code 取 catalog，否则才轮到后端 detail
    const serverError = submitError ? errorText(submitError, locale) : undefined
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
                notify.success(
                    appKitMessage("login.successTitle"),
                    appKitMessage("login.successDescription"),
                )
                onSuccess()
            } catch (error) {
                // 两层通道并存：422 字段级明细落进对应输入框；凭证类失败是 401 带 code（不走 422、errors[] 为空），
                // 交给下面 dispatch submitFailed 那条通道。deviceId 由调用方注入、不在这张表单，不进白名单
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        phone: "phone",
                        code: "code",
                        password: "password",
                    }),
                )
                dispatch({ type: "submitFailed", error: toApiError(error) })
                // 继续往外抛：接口错误由 submitForm 静默，非接口错误（onSuccess 炸了、映射写错）它会上报监控——这里吞掉就是「点了没反应」
                throw error
            }
        },
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

    /** 先校手机号，再开人机验证浮层。每次开都换新图：发码 token 一次性，上一张验过就作废 */
    function openCaptchaChallenge() {
        if (!PHONE_PATTERN.test(form.getFieldValue("phone"))) {
            document.getElementById("login-phone")?.focus()
            notify.error(appKitMessage("login.needPhone"))
            return
        }
        setCaptchaOpen(true)
        void refreshCaptcha()
    }

    // 发码是纯命令（无 query 缓存介入），不用 useMutation；promise 链而非 try/finally（React Compiler 暂不支持 finally 块）。
    // 校验放提交时而不是 disable 按钮：永远灰着又不说为什么的按钮，用户只能猜「页面坏了」——缺什么就聚焦到那个字段并说清
    function handleSendCode() {
        const captchaCode = form.getFieldValue("captchaCode")
        if (!captcha.image) {
            notify.error(appKitMessage("login.captchaLoading"))
            return
        }
        if (!isCaptchaCodeComplete(captchaCode)) {
            document.getElementById("login-captchaCode")?.focus()
            return
        }

        setSendingCode(true)
        void sendCode({
            phone: form.getFieldValue("phone"),
            captchaId: captcha.captchaId,
            captchaCode,
        })
            .then(() => {
                dispatch({ type: "sendCodeSucceeded" })
                setCountdown(RESEND_COUNTDOWN_SECONDS)
                notify.success(appKitMessage("login.codeSent"))
                // 发码 token 一次性用完即废；连同浮层收掉、焦点送回短信码输入框，用户可接着输刚收到的码
                clearCaptcha()
                form.setFieldValue("captchaCode", "")
                setCaptchaOpen(false)
                document.getElementById("login-code")?.focus()
                return undefined
            })
            .catch((error) => {
                const err = toApiError(error)
                dispatch({ type: "sendCodeFailed", error: err })
                // 图形验证码类失败：换新图、清输入，浮层留着让用户重输（其余错误保留原图避免无谓请求）
                if (isCaptchaError(err)) {
                    resetCaptcha()
                    form.setFieldValue("captchaCode", "")
                }
                // 429 限频：服务端窗口就是 60s，命中时本地同样起倒计时——连点只会再撞一次限流，倒计时无损失地兜住
                if (isSmsRateLimit(err)) {
                    setCountdown(RESEND_COUNTDOWN_SECONDS)
                    setCaptchaOpen(false)
                }
                notify.fromError(err)
            })
            .finally(() => setSendingCode(false))
    }

    // 提交失败：服务端错误节点渲染后把焦点移过去（role="alert" 已播报，聚焦便于键盘用户定位）
    useEffect(() => {
        if (submitFailCount > 0) serverErrorRef.current?.focus()
    }, [submitFailCount])

    function switchTab(next: LoginTab) {
        dispatch({ type: "switchTab", tab: next })
        // 离开短信 Tab 时收起人机验证浮层：它在表单之外，不跟着 Tab 走
        if (next !== "sms") setCaptchaOpen(false)
    }

    return (
        <form
            className="flex min-w-0 flex-1 flex-col gap-6"
            onSubmit={(e) => {
                e.preventDefault()
                void submitForm(form)
            }}
        >
            {/* 登录方式切换用 Tabs 原语（不自造按钮）：激活态要有 role=tab + aria-selected 且键盘可达，排版间距交给原语 */}
            <Tabs
                value={tab}
                onValueChange={(next: LoginTab) => switchTab(next)}
            >
                <TabsList variant="line">
                    <TabsTrigger value="sms">{t("login.smsTab")}</TabsTrigger>
                    <TabsTrigger value="password">{t("login.passwordTab")}</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Tab 头到内容这档间距要最松：line 变体的下划线画在 TabsList 盒子外 5px，会吃掉间距，给窄了就「Tab 压在输入框上」 */}
            <div className="flex flex-col gap-4">
                {/* 手机号用项目的 PhoneField：值仍是裸 11 位、与契约一致，不引入 reui 的国际 E.164 形态与国旗触发器 */}
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
                    <form.AppField name="code">
                        {(field) => (
                            <Field>
                                <InputGroup
                                    ref={codeRowRef}
                                    size="lg"
                                    variant="filled"
                                    invalid={codeInvalid}
                                >
                                    <InputGroupInput
                                        id="login-code"
                                        aria-label={t("login.smsCodeLabel")}
                                        aria-invalid={!field.state.meta.isValid}
                                        variant="code"
                                        className="tabular-nums"
                                        placeholder={t("login.smsCodePlaceholder")}
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
                                    {/* 发码入口：点开人机验证浮层而不是直接发；倒计时/发码中才置灰，缺什么在浮层里说 */}
                                    <Popover
                                        open={captchaOpen}
                                        onOpenChange={(next) => {
                                            // 打开才校手机号：号码还没成型时不开浮层，直接把焦点送回手机号
                                            if (next) {
                                                openCaptchaChallenge()
                                                return
                                            }
                                            setCaptchaOpen(false)
                                        }}
                                    >
                                        <PopoverTrigger
                                            render={
                                                <InputGroupButton
                                                    variant="link"
                                                    size="sm"
                                                    className="h-full shrink-0 px-3.5"
                                                    disabled={countdown > 0 || sendingCode}
                                                />
                                            }
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
                                        </PopoverTrigger>
                                        {/* 浮层按「验证码那一整行」展开：anchor 指行本身而非那颗小按钮，宽度等于该行、左右对齐 */}
                                        <PopoverContent
                                            anchor={codeRowRef}
                                            sideOffset={8}
                                            className="w-(--anchor-width)"
                                        >
                                            {/* 图形码当前值走 form.Subscribe：getFieldValue 不订阅，浮层里输入不会重渲染 */}
                                            <form.Subscribe selector={(s) => s.values.captchaCode}>
                                                {(captchaCode) => (
                                                    <CaptchaChallenge
                                                        image={captcha.image}
                                                        loading={captcha.loading}
                                                        code={captchaCode}
                                                        invalid={captchaInvalid}
                                                        onCodeChange={(v) => {
                                                            form.setFieldValue("captchaCode", v)
                                                            dispatch({
                                                                type: "dismissCaptchaError",
                                                            })
                                                        }}
                                                        onRefresh={() => void refreshCaptcha()}
                                                        onSubmit={handleSendCode}
                                                        sending={sendingCode}
                                                    />
                                                )}
                                            </form.Subscribe>
                                        </PopoverContent>
                                    </Popover>
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
                                id="login-password"
                                label={t("login.passwordLabel")}
                                placeholder={t("login.passwordPlaceholder")}
                            />
                        )}
                    </form.AppField>
                )}
            </div>

            {/* 动作区：按钮和它的反馈行是一组（gap-2），与脚注之间仍是区块级间距 */}
            <div className="flex flex-col gap-2">
                <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                    {({ isSubmitting }) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("login.submit")}
                        />
                    )}
                </form.Subscribe>

                {/* 预留一行高度（min-h-4）防点完按钮抖：错误行出现会把后面内容下推。这份预留只能挂在按钮之后，
                    挂在字段与按钮之间会和两侧 gap 叠成一坨空档，按钮看着像被切出去了 */}
                <div className="min-h-4">
                    <FormError
                        ref={serverErrorRef}
                        tabIndex={-1}
                    >
                        {serverError}
                    </FormError>
                </div>
            </div>

            {footer}
        </form>
    )
}

/** 人机验证浮层内容（点「获取验证码」才弹，不常驻）：图形码只用于解锁发码，常驻会让人把它当必填登录信息 */
function CaptchaChallenge({
    image,
    loading,
    code,
    invalid,
    onCodeChange,
    onRefresh,
    onSubmit,
    sending,
}: {
    image: string
    loading: boolean
    code: string
    invalid: boolean
    onCodeChange: (value: string) => void
    onRefresh: () => void
    onSubmit: () => void
    sending: boolean
}) {
    const t = useT()
    return (
        <form
            className="flex flex-col gap-3 p-1"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            <PopoverHeader>
                <PopoverTitle>{t("login.captchaTitle")}</PopoverTitle>
                <PopoverDescription>{t("login.captchaDesc")}</PopoverDescription>
            </PopoverHeader>
            <InputGroup
                size="lg"
                variant="filled"
                invalid={invalid}
            >
                <InputGroupInput
                    id="login-captchaCode"
                    aria-label={t("login.captchaLabel")}
                    aria-invalid={invalid}
                    variant="code"
                    placeholder={t("login.captchaPlaceholder")}
                    autoComplete="off"
                    maxLength={CAPTCHA_CODE_DIGITS}
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
                />
                <button
                    type="button"
                    aria-label={t("login.captchaRefresh")}
                    onClick={onRefresh}
                    className="shrink-0 self-stretch border-l border-border/60"
                >
                    {image ? (
                        <img
                            src={image}
                            alt={t("login.captchaAlt")}
                            className="h-full w-24 rounded-r-xl"
                        />
                    ) : loading ? (
                        <Skeleton className="h-full w-24" />
                    ) : (
                        <span className="flex h-full w-24 items-center justify-center text-xs text-muted-foreground">
                            {t("login.captchaClick")}
                        </span>
                    )}
                </button>
            </InputGroup>
            {/* 按钮用 type=button + onClick：PopoverContent 传送到 body 后 DOM 上不是嵌套 form，原生提交会走形；form 的 onSubmit 留给「输入后回车」 */}
            <Button
                type="button"
                variant="cta"
                className="h-11 w-full"
                disabled={sending}
                onClick={onSubmit}
            >
                {sending && <Spinner />}
                {t("login.captchaConfirm")}
            </Button>
        </form>
    )
}
