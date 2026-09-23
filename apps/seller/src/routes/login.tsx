import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Store } from "lucide-react"

import { AuthApi } from "@shop/api/sdk"
import { LoginForm } from "@shop/app-kit"
import { Card, CardContent } from "@shop/ui-web"

import { authState, bootstrapAuth, getDeviceId, tokenStore } from "#/shared/lib/api"

export const Route = createFileRoute("/login")({
    component: LoginPage,
})

/**
 * 图形验证码（匿名公开接口）。**必须是模块级函数**：LoginForm 把它透给 useCaptcha，
 * 行内闭包每次渲染都是新引用，useCaptcha 的 refresh 随之变新，「显现即拉验证码」的 effect
 * 就会每渲染一次打一次后端（web 端同源做法见 apps/web/src/auth/actions.ts 的 getCaptcha）。
 */
async function getCaptcha(): Promise<{ captchaId: string; image: string }> {
    const data = await AuthApi.getCaptcha()
    return { captchaId: data.captchaId, image: data.image }
}

/**
 * 卖家中心登录页：壳（Card + 品牌头）+ app-kit 的 LoginForm。
 * 表单交互一律在 LoginForm 里，这里只装配 seller 的 SDK 动作与登录后的跳转。
 */
function LoginPage() {
    const navigate = useNavigate()

    // 已登录（refresh cookie 有效）直接进入工作台
    useEffect(() => {
        void (async () => {
            await bootstrapAuth()
            if (authState.getStatus() === "authed") {
                await navigate({ to: "/", replace: true })
            }
        })()
    }, [navigate])

    return (
        <div className="flex min-h-dvh items-center justify-center bg-sunken px-4">
            <Card className="w-full max-w-sm">
                <CardContent className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <Store className="size-5" />
                        </div>
                        <h1 className="text-lg font-semibold tracking-tight">登录卖家中心</h1>
                    </div>

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
                </CardContent>
            </Card>
        </div>
    )
}
