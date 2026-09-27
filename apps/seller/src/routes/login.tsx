import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Globe, Store } from "lucide-react"

import { AuthApi } from "@shop/api/sdk"
import { LocaleSwitcher, LoginForm, useT } from "@shop/app-kit"
import type { CSSVars } from "@shop/ui-web"

import { authState, bootstrapAuth, getDeviceId, tokenStore } from "#/shared/lib/api"

export const Route = createFileRoute("/login")({
    /**
     * 已登录（refresh cookie 有效）不进登录页：交给守卫在渲染前裁决。
     * 之前在组件里用 effect 判，等于先让表单闪一帧再把人赶走。
     */
    beforeLoad: async () => {
        await bootstrapAuth()
        if (authState.getStatus() === "authed") throw redirect({ to: "/" })
    },
    component: LoginPage,
})

/**
 * 图形验证码（匿名公开接口）。**必须是模块级稳定引用**：LoginForm 把它透给 useCaptcha，
 * 行内闭包每次渲染都是新函数，useCaptcha 的 refresh 随之变新，「显现即拉验证码」的 effect
 * 就会每渲染一次打一次后端（web 端同源做法见 apps/web/src/auth/actions.ts 的 getCaptcha）。
 */
const getCaptcha = () => AuthApi.getCaptcha()

/**
 * 卖家中心登录页：壳（左侧品牌舞台 + 右侧表单栏）+ app-kit 的 LoginForm。
 * 表单交互一律在 LoginForm 里，这里只装配 seller 的 SDK 动作与登录后的跳转。
 */
function LoginPage() {
    const t = useT()
    const navigate = useNavigate()

    return (
        <div className="login-page flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-12">
            <Stage />

            {/* lg 起两栏共用网格：语言切换与左侧品牌同一条顶线（52px）；
                表单不再垂直居中，标题中线钉在主轴上（切 Tab 表单变高也不会跳） */}
            <main className="relative flex flex-1 flex-col p-6 sm:p-10 lg:col-span-5 lg:px-13 lg:pt-0 lg:pb-13 xl:col-span-6">
                <div className="flex items-center justify-end gap-1 text-muted-foreground lg:absolute lg:top-13 lg:right-13">
                    <Globe className="size-4" />
                    <LocaleSwitcher className="h-9 cursor-pointer rounded-lg bg-transparent text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" />
                </div>

                <div className="mx-auto w-full max-w-sm animate-in py-12 duration-700 fade-in fill-mode-both slide-in-from-bottom-2 lg:pb-0 lg:login-axis-top xl:max-w-md">
                    <h1 className="text-3xl font-semibold lg:text-4xl">
                        {t("seller.login.title")}
                    </h1>
                    <p className="mt-2 text-muted-foreground">{t("seller.login.welcome")}</p>

                    <div className="mt-10">
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
                                              body: {
                                                  phone: value.phone,
                                                  code: value.code,
                                                  deviceId,
                                              },
                                          })
                                        : await AuthApi.loginByPassword({
                                              body: {
                                                  phone: value.phone,
                                                  password: value.password,
                                                  deviceId,
                                              },
                                          })
                                tokenStore.set(res.accessToken)
                            }}
                            onSuccess={() => {
                                void navigate({ to: "/", replace: true })
                            }}
                        />
                    </div>
                </div>
            </main>
        </div>
    )
}

/** 品牌舞台：钴蓝海报 + 业务线路图。lg 以上铺满左半屏；窄屏收成顶部横幅，只留品牌与标语。
    内边距固定 p-10：品牌、枢纽、标语的左缘同在 x=40，品牌顶线同右栏的语言切换（12+40=52px） */
function Stage() {
    const t = useT()
    return (
        <aside className="login-stage relative isolate m-3 flex h-60 shrink-0 flex-col justify-between overflow-hidden rounded-4xl p-6 text-primary-foreground sm:p-10 lg:col-span-7 lg:h-auto xl:col-span-6">
            <RouteMap />

            <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25 ring-inset">
                    <Store className="size-5" />
                </span>
                <span className="text-lg font-semibold">{t("seller.layout.brand")}</span>
            </div>

            <div>
                <p className="text-3xl leading-tight font-semibold whitespace-pre-line lg:text-4xl xl:text-5xl">
                    {t("seller.login.headline")}
                </p>
                <p className="mt-4 hidden max-w-md text-primary-foreground/75 sm:block lg:text-lg">
                    {t("seller.login.pitch")}
                </p>
            </div>
        </aside>
    )
}

/**
 * 业务线路图的几何，单位就是 px（SVG 不设 viewBox、不缩放：线宽与站名字号在任何屏宽下都不变）。
 * 地铁图画法：只走水平与 45°，拐角用二次曲线倒圆。三条线从枢纽（52,300）并排出发后分叉，
 * 站点落在三条线共用的列上（STOP_COLUMNS），站名一律标在线下方、复用侧栏菜单文案。
 * 整张图按 --login-axis 垂直定位（见 styles.css），交易线因此与右栏表单标题的中线同高；
 * 线一直画到 1400 再由 .login-map 的 mask 在舞台右缘渐隐，不会在两栏交界处被切断。
 */
const LINES = [
    {
        key: "product",
        d: "M52 286H80Q96 286 107.3 274.7L190.7 191.3Q202 180 218 180H1400",
        y: 180,
        stops: ["seller.nav.product.create", "seller.nav.product.list", "seller.nav.product.stock"],
    },
    {
        key: "trade",
        d: "M52 300H1400",
        y: 300,
        stops: ["seller.nav.trade.order", "seller.nav.trade.ship", "seller.nav.trade.logistics"],
    },
    {
        key: "marketing",
        d: "M52 314H100Q116 314 127.3 325.3L190.7 388.7Q202 400 218 400H1400",
        y: 400,
        stops: [
            "seller.nav.marketing.coupon",
            "seller.nav.marketing.campaign",
            "seller.nav.marketing.flash",
        ],
    },
] as const
const STOP_COLUMNS = [250, 350, 450] as const

/** 纯装饰（aria-hidden）：进场时线路从枢纽画出去，之后每条线上有一束光往外跑；样式与动效全在 styles.css */
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
                    {t("seller.login.youAreHere")}
                </text>
            </g>
        </svg>
    )
}
