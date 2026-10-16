import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Globe, Store } from "lucide-react"
import { useState } from "react"

import { AuthApi } from "@shop/api/sdk"
import { LocaleSwitcher } from "@shop/app-kit/i18n"
import { LoginForm } from "@shop/app-kit/auth"
import { Tabs, TabsList, TabsTrigger, type CSSVars } from "@shop/ui-web"

import { SubaccountLoginForm } from "#/auth/subaccount-login"
import { useT } from "#/locales/use-t"
import { authState, bootstrapAuth, getDeviceId, tokenStore } from "#/shared/lib/api"
import { useClearMe } from "#/shared/lib/me"
import { setSessionKind } from "#/shared/lib/session-kind"

export const Route = createFileRoute("/login")({
    // 已登录（refresh cookie 有效）在渲染前由守卫跳走，别改回组件 effect 判：会让表单闪一帧
    beforeLoad: async () => {
        await bootstrapAuth()
        if (authState.getStatus() === "authed") throw redirect({ to: "/" })
    },
    component: LoginPage,
})

// getCaptcha 必须模块级稳定引用：行内闭包每渲染变新，useCaptcha 的 effect 会每渲染刷一次验证码
const getCaptcha = () => AuthApi.getCaptcha()

function LoginPage() {
    const t = useT()
    const navigate = useNavigate()
    const [entry, setEntry] = useState<LoginEntry>("owner")

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

                    <div className="mt-10">
                        <Tabs
                            value={entry}
                            onValueChange={(next: LoginEntry) => setEntry(next)}
                        >
                            <TabsList variant="line">
                                <TabsTrigger value="owner">{t("login.entry.owner")}</TabsTrigger>
                                <TabsTrigger value="subaccount">
                                    {t("login.entry.subaccount")}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="mt-8">
                        {entry === "owner" ? (
                            <OwnerLogin onSuccess={() => navigate({ to: "/", replace: true })} />
                        ) : (
                            <SubaccountLoginForm />
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}

type LoginEntry = "owner" | "subaccount"

// 店主登录成功要显式写回 owner：上一位可能是子账号，不覆盖会后请求打子账号刷新端点且不注入 X-Shop-Id
function OwnerLogin({ onSuccess }: { onSuccess: () => void }) {
    const clearMe = useClearMe()
    return (
        <LoginForm
            getCaptcha={getCaptcha}
            sendCode={async (input) => {
                await AuthApi.sendSmsCode({ body: input })
            }}
            submit={async (value) => {
                const deviceId = getDeviceId()
                const res =
                    value.tab === "sms"
                        ? await AuthApi.loginBySms({
                              body: { phone: value.phone, code: value.code, deviceId },
                          })
                        : await AuthApi.loginByPassword({
                              body: { phone: value.phone, password: value.password, deviceId },
                          })
                // 换主体顺序不能乱：先清身份缓存、再定会话种类、最后写令牌（写令牌会放行取数，那些请求必须已看到新会话）
                clearMe()
                setSessionKind("owner")
                tokenStore.set(res.accessToken)
            }}
            onSuccess={onSuccess}
        />
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
        stops: ["nav.marketing.coupon", "nav.marketing.campaign", "nav.marketing.flash"],
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
