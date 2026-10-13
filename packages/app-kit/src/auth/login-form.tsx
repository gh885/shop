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
 * LoginForm —— 短信/密码双 Tab 登录表单（web 弹窗与 seller 登录页共用的应用层组件）。
 *
 * 为什么在 app-kit：它同时知道契约（SmsFormSchema / ApiError 错误码语义）与 UI（ui-web 控件），
 * 且「输错验证码抖动、图形验证码失效换图、发码倒计时」这套交互两端必须一致 —— 正是 app-kit
 * 的职责边界。端差异只留两处入参：动作装配（getCaptcha/sendCode/submit）
 * 与壳（web 是 Dialog + 扫码占位，seller 是 Card）。
 *
 * 自有状态全部是表单瞬时态：Tab、服务端错误、倒计时、发码中、人机验证浮层的开合。
 * 登录态写入（tokenStore）与跳转/关闭弹窗由调用方在 submit / onSuccess 里做。
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
    /** 表单底部附加内容（协议文案等） */
    footer?: React.ReactNode
}

/** 表单控件统一尺寸（B 端紧凑档）：控件高 44px（h-11）、验证码图宽 96px（w-24）。
 *  以前按端查表分 sm/md 两档，但两档只差 4px/8px，为它维护一张查表 + 一个 size prop
 *  不划算，也挡住了 lint 对类名的检查（require-static-classes 读不到查表里的变量）。
 *  类名一律就地写成字面量，别再收敛回常量——收敛回去规则就又看不见了 */

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
    // refresh/reset 的稳定性来自入参 getCaptcha 的稳定性（useCaptcha 把它放进了 useCallback 依赖），
    // 所以调用方必须传模块级函数——传行内闭包会让下面「显现即拉验证码」的 effect 每渲染打一次后端
    const { refresh: refreshCaptcha, reset: resetCaptcha, clear: clearCaptcha } = captcha
    // 人机验证浮层的开关：点「获取验证码」才开，验过才真发码——图形码不占地表单一整行
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
                // 两层通道并存：422 的字段级明细（phone/code/password）落进对应输入框；
                // deviceId 由调用方注入、不在这张表单里，不进白名单。凭证类失败是 401 带 code
                // （TOKEN_EXPIRED / 密码错误等），不走 422，errors[] 为空 → 上面那次调用把上一轮的
                // 落框清掉，错误交给下面 dispatch submitFailed 那条通道（底部 FormError + 验证码抖动）
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        phone: "phone",
                        code: "code",
                        password: "password",
                    }),
                )
                dispatch({ type: "submitFailed", error: toApiError(error) })
                // 继续往外抛：接口错误由 submitForm 静默（底部那条通道已经讲过了），
                // 非接口错误（onSuccess 炸了、映射写错）它会上报监控——在这里吞掉就是「点了没反应」
                throw error
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

    /** 点「获取验证码」：先校手机号，再开人机验证浮层。真正发码在浮层里验完图之后。
     *  每次开都换新图：发码 token 一次性，上一张验过就用废了 */
    function openCaptchaChallenge() {
        if (!PHONE_PATTERN.test(form.getFieldValue("phone"))) {
            document.getElementById("login-phone")?.focus()
            notify.error(appKitMessage("login.needPhone"))
            return
        }
        setCaptchaOpen(true)
        void refreshCaptcha()
    }

    // 发码是纯命令（无任何 query 缓存介入）：倒计时/验证码图/错误提示全是本地状态，
    // 不需要 useMutation；用 promise 链而非 try/finally（React Compiler 暂不支持 finally 块）。
    //
    // 校验放在提交时而不是把按钮 disable 掉：一个永远灰着、旁边又不写为什么的按钮，
    // 用户只能猜（多半猜成「页面坏了」）。缺什么就聚焦到哪个字段并说清缺什么。
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
                // 发码 token 一次性，用完即废；连同浮层一起收掉，并把焦点送回短信码输入框，
                // 用户可以直接接着输刚收到的码
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
                // 429 限频：服务端窗口就是 60s，命中时本地同样起倒计时——
                // 连点只会再撞一次限流，倒计时无损失地兜住（发码成功的本地倒计时逻辑不变）
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
            {/* 登录方式切换用 Tabs 原语，不自造按钮：激活态要有 role=tab + aria-selected，
                键盘也要走得到（方向键移焦、回车激活）。排版与间距一律交给原语，
                这里不覆写——指示条就是 line 变体自己的 after。 */}
            <Tabs
                value={tab}
                onValueChange={(next: LoginTab) => switchTab(next)}
            >
                <TabsList variant="line">
                    <TabsTrigger value="sms">{t("login.smsTab")}</TabsTrigger>
                    <TabsTrigger value="password">{t("login.passwordTab")}</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* 字段区。三档间距各管一层，别拉平：区块之间 32（form 的 gap-8）、
                字段之间 16（这里的 gap-4）、按钮与它的反馈行 8（下面动作区的 gap-2）。
                Tab 头到内容这一档要最松：line 变体的下划线画在 TabsList 盒子外 5px 处，
                它会吃掉一部分间距，给窄了就是「Tab 压在输入框上」。 */}
            <div className="flex flex-col gap-4">
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
                    /* 验证码 + 内嵌发送按钮（点开人机验证浮层，验过才真发码） */
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
                                    {/* 发码入口：点开人机验证浮层（而不是直接发）。
                                    倒计时/发码中才置灰，其余一律可点——缺什么在浮层里说 */}
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
                                        {/* 浮层按「验证码那一整行」展开：anchor 指到行本身，而不是指到触发它的
                                        那颗小按钮。于是宽度刚好等于这一行、左右边缘对齐，用户读得出它是
                                        这一行的后续，而不是半路冒出来压在登录按钮上的一块浮皮。 */}
                                        <PopoverContent
                                            anchor={codeRowRef}
                                            sideOffset={8}
                                            className="w-(--anchor-width)"
                                        >
                                            {/* 图形码的当前值走 form.Subscribe：getFieldValue 不订阅，
                                            浮层里输入时不会重渲染 */}
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

            {/* 动作区：按钮和它自己的反馈行是一组，所以错误行只离按钮 8px，
                离脚注仍是区块级的 24px。 */}
            <div className="flex flex-col gap-2">
                <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                    {({ isSubmitting }) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("login.submit")}
                        />
                    )}
                </form.Subscribe>

                {/* 服务端错误（role="alert" 播报，提交失败时聚焦）。预留一行高度是为了点完按钮不抖：
                错误行一出现就把后面的内容往下推 18px，而按钮正压在用户刚点过的位置上。
                这份预留只能挂在按钮**之后**——挂在字段与按钮之间时，它会和两侧 gap 叠成
                一坨空档，按钮看着像被从表单里切了出去、反倒跟脚注成了一组。 */}
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

/**
 * 人机验证浮层的内容（渲染在 Popover 里，点「获取验证码」才出现）。
 *
 * 为什么做成「点发码才弹」而不是表单里常驻一行：图形码只有一个用途——解锁发码，
 * 常驻在手机号与短信码之间会让用户先面对一个看不懂的输入框，还把它当必填登录信息。
 * 收到发码意图才问「你是人吗」，是这类挑战的正确位置（淘宝/京东/微信同款）。
 */
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
                {/* 验证码图：点击刷新；加载/无图时占位 */}
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
            {/* 按钮是 type=button + onClick：PopoverContent 传送到 body，DOM 上不再是嵌套 form，
                交给浏览器原生提交会走形。form 上的 onSubmit 保留给「输入后回车」这条路。 */}
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
