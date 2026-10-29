import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Globe, Store } from "lucide-react"
import { useRef, useState } from "react"
import { z } from "zod"

import { SellerLoginControllerApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
import { LocaleSwitcher } from "@shop/app-kit/i18n"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { SubmitButton, usePasswordVisibility } from "@shop/app-kit/auth"
import {
    type CSSVars,
    FormError,
    PasswordToggle,
    applyServerFieldErrors,
    useAppForm,
    cn,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { authState, bootstrapAuth, tokenStore } from "#/shared/lib/api"
import { useClearMe } from "#/shared/lib/me"

export const Route = createFileRoute("/login")({
    // 已登录（refresh cookie 有效）在渲染前由守卫跳走，别改回组件 effect 判：会让表单闪一帧
    beforeLoad: async () => {
        await bootstrapAuth()
        if (authState.getStatus() === "authed") throw redirect({ to: "/" })
    },
    component: LoginPage,
})

const loginSchema = (required: { loginName: string; password: string }) =>
    z.object({
        loginName: z.string().trim().min(1, required.loginName),
        password: z.string().min(1, required.password),
    })

function LoginPage() {
    const t = useT()
    const navigate = useNavigate()

    return (
        <div className="login-page flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-12">
            <Stage />

            <main className="relative flex flex-1 flex-col p-6 sm:p-10 lg:col-span-5 lg:px-13 lg:pt-0 lg:pb-13 xl:col-span-6">
                <div className="flex items-center justify-end gap-1 text-muted-foreground lg:absolute lg:top-13 lg:right-13">
                    <Globe className="size-4" />
                    <LocaleSwitcher className="h-9 cursor-pointer rounded-lg bg-transparent text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" />
                </div>

                <div className="mx-auto w-full max-w-sm animate-in py-12 duration-700 fade-in fill-mode-both slide-in-from-bottom-2 lg:pb-0 lg:login-axis-top xl:max-w-md">
                    <h1 className="text-3xl font-semibold lg:text-4xl">{t("login.title")}</h1>
                    <p className="mt-2 text-muted-foreground">{t("login.welcome")}</p>

                    <OwnerLogin onSuccess={() => navigate({ to: "/", replace: true })} />
                </div>
            </main>
        </div>
    )
}

function OwnerLogin({ onSuccess }: { onSuccess: () => void }) {
    const t = useT()
    const clearMe = useClearMe()
    const panelRef = useRef<HTMLDivElement>(null)
    const password = usePasswordVisibility()
    const [loginError, setLoginError] = useState<string | undefined>()

    const shake = () =>
        panelRef.current?.animate(
            {
                transform: [
                    "none",
                    "translateX(-8px)",
                    "translateX(6px)",
                    "translateX(-3px)",
                    "none",
                ],
            },
            { duration: 400, easing: "ease-out" },
        )

    const form = useAppForm({
        defaultValues: { loginName: "", password: "" },
        validators: {
            onSubmit: loginSchema({
                loginName: t("login.loginNameRequired"),
                password: t("login.passwordRequired"),
            }),
        },
        onSubmitInvalid: shake,
        onSubmit: async ({ value }) => {
            setLoginError(undefined)
            try {
                const res = await SellerLoginControllerApi.sellerLogin({
                    body: { loginName: value.loginName.trim(), password: value.password },
                })
                if (!res.accessToken) throw new Error("登录响应缺少 accessToken")
                // 换主体顺序不能乱：先清身份缓存、再写令牌（写令牌会放行取数，那些请求必须已看到新会话）
                clearMe()
                tokenStore.set(res.accessToken)
                onSuccess()
            } catch (error) {
                const texts = serverFieldErrors(error, {
                    loginName: "loginName",
                    password: "password",
                })
                applyServerFieldErrors(form, texts)
                if (Object.keys(texts).length === 0) {
                    const apiErr = toApiError(error)
                    setLoginError(
                        apiErr.status === 401 ? t("login.invalidCredentials") : t("login.failed"),
                    )
                }
                shake()
                // 原样 rethrow：submitForm 靠这条 rejection 判定提交状态，别在这里吞掉
                throw error
            }
        },
    })

    return (
        <div
            ref={panelRef}
            className="mt-8"
        >
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault()
                    // 用 submitForm 而非 form.handleSubmit()：后者会把 rethrow 变成未处理异常，由 submitForm 分流
                    void submitForm(form)
                }}
                className="space-y-8"
            >
                <form.AppField name="loginName">
                    {(field) => (
                        <field.TextField
                            label={t("login.loginName")}
                            type="text"
                            autoComplete="username"
                            className="login-line"
                        />
                    )}
                </form.AppField>
                <form.AppField name="password">
                    {(field) => (
                        <field.TextField
                            label={t("login.password")}
                            type={password.inputType}
                            autoComplete="current-password"
                            className={cn("login-line", "login-line-has-trailing")}
                            trailing={<PasswordToggle {...password.toggleProps} />}
                        />
                    )}
                </form.AppField>
                <FormError>{loginError}</FormError>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("login.signIn")}
                            className="w-full"
                        />
                    )}
                </form.Subscribe>
            </form>
        </div>
    )
}

function Stage() {
    const t = useT()
    return (
        <aside className="login-stage relative isolate m-3 flex h-60 shrink-0 flex-col justify-between overflow-hidden rounded-4xl p-6 text-primary-foreground sm:p-10 lg:col-span-7 lg:h-auto xl:col-span-6">
            <RouteMap />

            <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15 ring-1 ring-primary-foreground/25 ring-inset">
                    <Store className="size-5" />
                </span>
                <span className="text-lg font-semibold">{t("layout.brand")}</span>
            </div>

            <div>
                <p className="text-3xl leading-tight font-semibold whitespace-pre-line lg:text-4xl xl:text-5xl">
                    {t("login.headline")}
                </p>
                <p className="mt-4 hidden max-w-md text-primary-foreground/75 sm:block lg:text-lg">
                    {t("login.pitch")}
                </p>
            </div>
        </aside>
    )
}

const LINES = [
    {
        key: "product",
        d: "M52 286H80Q96 286 107.3 274.7L190.7 191.3Q202 180 218 180H1400",
        y: 180,
        stops: ["nav.product.create", "nav.product.list", "nav.product.stock"],
    },
    {
        key: "trade",
        d: "M52 300H1400",
        y: 300,
        stops: ["nav.trade.order", "nav.trade.ship", "nav.trade.logistics"],
    },
    {
        key: "marketing",
        d: "M52 314H100Q116 314 127.3 325.3L190.7 388.7Q202 400 218 400H1400",
        y: 400,
        stops: ["nav.marketing.campaign", "nav.marketing.flash"],
    },
] as const
const STOP_COLUMNS = [250, 350, 450] as const

function RouteMap() {
    const t = useT()
    return (
        <svg
            aria-hidden
            className="login-map absolute inset-0 -z-10 hidden size-full lg:block"
        >
            <g className="login-map-content">
                {LINES.map((line, i) => (
                    <g
                        key={line.key}
                        data-line={line.key}
                        style={{ "--i": i } as CSSVars}
                    >
                        <path
                            d={line.d}
                            pathLength={100}
                            className="login-track"
                        />
                        <path
                            d={line.d}
                            pathLength={100}
                            className="login-pulse"
                        />
                        {line.stops.map((key, j) => (
                            <g key={key}>
                                <circle
                                    cx={STOP_COLUMNS[j]}
                                    cy={line.y}
                                    r={5}
                                    className="login-stop"
                                />
                                <text
                                    x={STOP_COLUMNS[j]}
                                    y={line.y + 24}
                                    textAnchor="middle"
                                    className="login-stop-label"
                                >
                                    {t(key)}
                                </text>
                            </g>
                        ))}
                    </g>
                ))}

                <circle
                    cx={52}
                    cy={300}
                    r={26}
                    className="login-ping"
                />
                <rect
                    x={40}
                    y={275}
                    width={24}
                    height={50}
                    rx={12}
                    className="login-hub"
                />
                <text
                    x={40}
                    y={350}
                    className="login-stop-label"
                >
                    {t("login.youAreHere")}
                </text>
            </g>
        </svg>
    )
}
