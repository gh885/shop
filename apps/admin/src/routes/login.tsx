import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"

import { AdminAuthApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common"
import { useT } from "@shop/app-kit"
import { Button, Card, CardContent, FormError, Spinner, useAppForm } from "@shop/ui-web"

import { getDeviceId, requireGuest, tokenStore } from "../shared/lib/api"

export const Route = createFileRoute("/login")({
    beforeLoad: requireGuest,
    component: LoginPage,
})

/** 与后端登录 @NotBlank 类校验对齐 */
const LoginSchema = z.object({
    employeeNo: z.string().trim().min(1, "请输入工号"),
    password: z.string().min(1, "请输入密码"),
})

function LoginPage() {
    const t = useT()
    const navigate = Route.useNavigate()
    const [loginError, setLoginError] = useState<string | undefined>()

    const form = useAppForm({
        defaultValues: { employeeNo: "", password: "" },
        validators: { onSubmit: LoginSchema },
        onSubmit: async ({ value }) => {
            setLoginError(undefined)
            try {
                const session = await AdminAuthApi.staffLogin({
                    body: {
                        employeeNo: value.employeeNo.trim(),
                        password: value.password,
                        deviceId: getDeviceId(),
                    },
                })
                tokenStore.set(session.accessToken)
                void navigate({ to: "/", search: { page: 1, size: 20 } })
            } catch (error) {
                // 401 才是凭证错误；网络错误/服务端故障如实提示，避免误导成密码错误
                const apiErr = toApiError(error)
                setLoginError(
                    apiErr.status === 401
                        ? t("admin.login.invalidCredentials")
                        : t("admin.login.failed"),
                )
            }
        },
    })

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Card className="w-full max-w-sm">
                <CardContent>
                    <div className="mb-6 flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                            {t("admin.login.logo")}
                        </span>
                        <div>
                            <div className="font-semibold">{t("admin.login.title")}</div>
                            <div className="text-xs text-muted-foreground">
                                {t("admin.login.subtitle")}
                            </div>
                        </div>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            void form.handleSubmit()
                        }}
                        className="space-y-4"
                    >
                        <form.AppField name="employeeNo">
                            {(field) => (
                                <field.TextField
                                    label={t("admin.login.employeeNo")}
                                    autoComplete="username"
                                    required
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="password">
                            {(field) => (
                                <field.TextField
                                    label={t("admin.login.password")}
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                />
                            )}
                        </form.AppField>
                        <FormError>{loginError}</FormError>
                        {/* 登录不是 mutation（token 直接落本地），加载态只能读表单自己的 isSubmitting */}
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => (
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting && <Spinner />}
                                    {t("admin.login.submit")}
                                </Button>
                            )}
                        </form.Subscribe>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
