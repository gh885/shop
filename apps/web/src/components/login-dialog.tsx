import { useEffect, useState } from "react"
import { CircleAlert, Loader2, QrCode } from "lucide-react"
import { z } from "zod"

import { useMutation } from "@tanstack/react-query"
import { ErrorCodes } from "@shop/api"
import { Button, cn, Dialog, DialogContent, DialogTitle, Input, useAppForm } from "@shop/ui-web"
import { authApi, toApiError } from "#/lib/api"
import { getDeviceId, tokenStore } from "#/lib/auth"

/* 嵌套行（+86 前缀 / 内嵌按钮）里的 Input：去掉自带边框与 focus ring，
   视觉容器由外层 wrapper（rounded + bg-muted + focus-within:ring）承担 */
const embeddedInputClass =
    "h-full flex-1 rounded-none border-0 bg-transparent px-3.5 py-0 focus-visible:ring-0"

type LoginTab = "sms" | "password"

// ---------- 校验 schema（与后端契约一致，见 packages/api/schemas/auth） ----------

const PHONE_PATTERN = /^1[3-9]\d{9}$/
const PhoneSchema = z.string().regex(PHONE_PATTERN, "请输入正确的手机号")

const SmsFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string().length(6, "请输入 6 位验证码"),
    password: z.string(),
})

const PasswordFormSchema = z.object({
    phone: PhoneSchema,
    code: z.string(),
    password: z.string().min(8, "密码至少 8 位"),
})

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const [tab, setTab] = useState<LoginTab>("sms")
    const [serverError, setServerError] = useState<string | null>(null)
    const [passwordNotSet, setPasswordNotSet] = useState(false)
    const [codeInvalid, setCodeInvalid] = useState(false)
    const [countdown, setCountdown] = useState(0)

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            setServerError(null)
            setPasswordNotSet(false)
            setCodeInvalid(false)
            try {
                const result =
                    tab === "sms"
                        ? await authApi.loginBySms({
                              phone: value.phone,
                              code: value.code,
                              deviceId: getDeviceId(),
                          })
                        : await authApi.loginByPassword({
                              phone: value.phone,
                              password: value.password,
                              deviceId: getDeviceId(),
                          })
                tokenStore.set(result.accessToken)
                onOpenChange(false)
                form.reset()
                setTab("sms")
                setCountdown(0)
            } catch (error) {
                const err = await toApiError(error)
                setServerError(err.detail)
                setPasswordNotSet(err.code === ErrorCodes.PASSWORD_NOT_SET)
                setCodeInvalid(
                    err.code === ErrorCodes.SMS_CODE_INVALID ||
                        err.code === ErrorCodes.SMS_CODE_EXPIRED,
                )
            }
        },
    })

    useEffect(() => {
        if (countdown <= 0) return
        const timer = setInterval(() => setCountdown((s) => s - 1), 1000)
        return () => clearInterval(timer)
    }, [countdown])

    const sendCode = useMutation({
        mutationFn: (phone: string) => authApi.sendSmsCode({ phone }),
        onSuccess: () => {
            setServerError(null)
            setCountdown(60)
        },
        onError: async (e) => {
            const err = await toApiError(e)
            setServerError(err.detail)
        },
    })

    function switchTab(next: LoginTab) {
        setTab(next)
        setServerError(null)
        setPasswordNotSet(false)
        setCodeInvalid(false)
    }

    function handleSendCode(phone: string) {
        sendCode.mutate(phone)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl">
                {/* 顶部品牌色环境光，打破纯平 */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-brand/8 to-transparent" />

                <div className="relative flex flex-col gap-7 p-8 pt-7">
                    <DialogTitle className="text-center text-xl font-semibold tracking-tight">
                        登录后畅享更多功能
                    </DialogTitle>

                    <div className="flex items-stretch gap-8">
                        {/* 扫码登录占位（后端未支持，仅 UI 预留） */}
                        <div className="hidden w-56 flex-col items-center justify-center gap-4 sm:flex">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">扫码登录</p>
                                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                                    即将上线
                                </span>
                            </div>
                            <div className="relative flex size-44 items-center justify-center rounded-2xl bg-muted/70">
                                {/* 扫码框四角标记 */}
                                <span className="absolute left-3 top-3 size-4 rounded-tl-md border-l-2 border-t-2 border-brand/50" />
                                <span className="absolute right-3 top-3 size-4 rounded-tr-md border-r-2 border-t-2 border-brand/50" />
                                <span className="absolute bottom-3 left-3 size-4 rounded-bl-md border-b-2 border-l-2 border-brand/50" />
                                <span className="absolute bottom-3 right-3 size-4 rounded-br-md border-b-2 border-r-2 border-brand/50" />
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
                                form.handleSubmit()
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
                                    <div className="flex h-12 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-brand/30">
                                        <span className="border-e px-3.5 text-sm tabular-nums text-muted-foreground">
                                            +86
                                        </span>
                                        <Input
                                            className={cn(
                                                embeddedInputClass,
                                                "text-sm tracking-wide tabular-nums placeholder:tracking-normal",
                                            )}
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
                                    </div>
                                )}
                            </form.AppField>

                            {tab === "sms" ? (
                                /* 验证码 + 内嵌发送按钮 */
                                <form.AppField name="code">
                                    {(field) => (
                                        <div
                                            className={cn(
                                                "flex h-12 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-brand/30",
                                                codeInvalid &&
                                                    "animate-shake ring-2 ring-destructive/40",
                                            )}
                                        >
                                            <Input
                                                className={cn(
                                                    embeddedInputClass,
                                                    "text-sm tracking-widest tabular-nums placeholder:tracking-normal",
                                                )}
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
                                                selector={(s) => PHONE_PATTERN.test(s.values.phone)}
                                            >
                                                {(phoneValid) => (
                                                    <button
                                                        type="button"
                                                        className="shrink-0 cursor-pointer px-3.5 text-sm font-medium text-brand transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:font-normal disabled:text-muted-foreground/60 disabled:hover:opacity-100"
                                                        disabled={
                                                            !phoneValid ||
                                                            countdown > 0 ||
                                                            sendCode.isPending
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
                                                        ) : sendCode.isPending ? (
                                                            "发送中…"
                                                        ) : (
                                                            "获取验证码"
                                                        )}
                                                    </button>
                                                )}
                                            </form.Subscribe>
                                        </div>
                                    )}
                                </form.AppField>
                            ) : (
                                <form.AppField name="password">
                                    {(field) => (
                                        <div className="flex h-12 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-brand/30">
                                            <Input
                                                className={cn(embeddedInputClass, "text-sm")}
                                                type="password"
                                                placeholder="请输入密码"
                                                autoComplete="current-password"
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => field.handleChange(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </form.AppField>
                            )}

                            {/* 服务端错误：预留高度，避免抖动 */}
                            <div className="min-h-4">
                                {serverError && (
                                    <p className="flex items-center gap-1.5 text-[13px] text-destructive">
                                        <CircleAlert className="size-3.5 shrink-0" />
                                        {serverError}
                                        {passwordNotSet && (
                                            <button
                                                type="button"
                                                className="shrink-0 cursor-pointer font-medium text-brand transition-opacity hover:opacity-70"
                                                onClick={() => switchTab("sms")}
                                            >
                                                改用验证码登录
                                            </button>
                                        )}
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
                                        className="h-12 w-full rounded-xl bg-brand text-[15px] font-semibold text-brand-foreground shadow-lg shadow-brand/25 transition-all hover:bg-brand-hover hover:shadow-brand/35 active:scale-[0.98] active:bg-brand-active disabled:opacity-40 disabled:shadow-none"
                                        disabled={!ready || isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="animate-spin" />
                                                登录中…
                                            </>
                                        ) : (
                                            "登录"
                                        )}
                                    </Button>
                                )}
                            </form.Subscribe>

                            <p className="text-center text-xs text-muted-foreground">
                                登录即代表同意
                                <button
                                    type="button"
                                    className="mx-1 cursor-pointer text-foreground transition-colors hover:text-brand"
                                >
                                    用户协议
                                </button>
                                和
                                <button
                                    type="button"
                                    className="mx-1 cursor-pointer text-foreground transition-colors hover:text-brand"
                                >
                                    隐私政策
                                </button>
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
                    "absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand transition-opacity duration-200",
                    active ? "opacity-100" : "opacity-0",
                )}
            />
        </button>
    )
}
