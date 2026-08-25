import { useEffect, useState } from "react"
import { CircleAlert, Loader2, Store } from "lucide-react"
import { z } from "zod"

import { useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ErrorCodes } from "@shop/api"
import { Button, Input, cn, useAppForm } from "@shop/ui-web"

import { authApi, bootstrapAuth, toApiError } from "#/lib/api"
import { authState, getDeviceId, tokenStore } from "#/lib/auth"

export const Route = createFileRoute("/login")({
    component: LoginPage,
})

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

type LoginTab = "sms" | "password"

function LoginPage() {
    const navigate = useNavigate()
    const [tab, setTab] = useState<LoginTab>("sms")
    const [serverError, setServerError] = useState<string | null>(null)
    const [codeInvalid, setCodeInvalid] = useState(false)
    const [countdown, setCountdown] = useState(0)

    // 已登录（refresh cookie 有效）直接进入工作台
    useEffect(() => {
        void bootstrapAuth().then(() => {
            if (authState.getStatus() === "authed") void navigate({ to: "/", replace: true })
        })
    }, [navigate])

    const form = useAppForm({
        defaultValues: { phone: "", code: "", password: "" },
        validators: { onSubmit: tab === "sms" ? SmsFormSchema : PasswordFormSchema },
        onSubmit: async ({ value }) => {
            setServerError(null)
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
                void navigate({ to: "/", replace: true })
            } catch (error) {
                const err = await toApiError(error)
                // 登录失败对外统一文案（后端刻意不暴露「未设密码」以反账号枚举）
                setServerError(err.detail)
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
        setCodeInvalid(false)
    }

    return (
        <div className="flex min-h-dvh items-center justify-center bg-sunken px-4">
            <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-sm ring-1 ring-border">
                <div className="mb-8 flex flex-col items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Store className="size-5" />
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight">登录卖家中心</h1>
                </div>

                <form
                    className="flex flex-col gap-4"
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

                    <form.AppField
                        name="phone"
                        validators={{ onChange: PhoneSchema }}
                    >
                        {(field) => (
                            <div className="flex h-11 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-ring">
                                <span className="border-e px-3.5 text-sm tabular-nums text-muted-foreground">
                                    +86
                                </span>
                                <Input
                                    className="h-full flex-1 rounded-none border-0 bg-transparent px-3.5 py-0 text-sm tracking-wide tabular-nums placeholder:tracking-normal focus-visible:ring-0"
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
                            </div>
                        )}
                    </form.AppField>

                    {tab === "sms" ? (
                        <form.AppField name="code">
                            {(field) => (
                                <div
                                    className={cn(
                                        "flex h-11 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-ring",
                                        codeInvalid && "animate-shake ring-2 ring-destructive/40",
                                    )}
                                >
                                    <Input
                                        className="h-full flex-1 rounded-none border-0 bg-transparent px-3.5 py-0 text-sm tracking-widest tabular-nums placeholder:tracking-normal focus-visible:ring-0"
                                        placeholder="请输入验证码"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => {
                                            field.handleChange(e.target.value.replaceAll(/\D/g, ""))
                                            setCodeInvalid(false)
                                        }}
                                    />
                                    <form.Subscribe
                                        selector={(s) => PHONE_PATTERN.test(s.values.phone)}
                                    >
                                        {(phoneValid) => (
                                            <button
                                                type="button"
                                                className="shrink-0 cursor-pointer px-3.5 text-sm font-medium text-primary transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:font-normal disabled:text-muted-foreground/60 disabled:hover:opacity-100"
                                                disabled={
                                                    !phoneValid ||
                                                    countdown > 0 ||
                                                    sendCode.isPending
                                                }
                                                onClick={() =>
                                                    sendCode.mutate(form.getFieldValue("phone"))
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
                                <div className="flex h-11 items-center rounded-xl bg-muted/70 transition-shadow focus-within:ring-2 focus-within:ring-ring">
                                    <Input
                                        className="h-full flex-1 rounded-none border-0 bg-transparent px-3.5 py-0 text-sm focus-visible:ring-0"
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
                                className="h-11 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px disabled:opacity-40"
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
                </form>
            </div>
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
