import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"

import { Button, Card, CardContent, Spinner, useAppForm } from "@shop/ui-web"

import { adminApi, requireGuest } from "../lib/api"
import { getDeviceId, tokenStore } from "../lib/api"
import { toApiError } from "@shop/api"

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
    const navigate = Route.useNavigate()
    const [error, setError] = useState<string | undefined>()

    const form = useAppForm({
        defaultValues: { employeeNo: "", password: "" },
        validators: { onSubmit: LoginSchema },
        onSubmit: async ({ value }) => {
            setError(undefined)
            try {
                const result = await adminApi.login({
                    employeeNo: value.employeeNo.trim(),
                    password: value.password,
                    deviceId: getDeviceId(),
                })
                tokenStore.set(result.accessToken)
                void navigate({ to: "/", search: { page: 1, size: 20 } })
            } catch (error) {
                // 401 才是凭证错误；网络错误/服务端故障如实提示，避免误导成密码错误
                const apiErr = toApiError(error)
                setError(apiErr.status === 401 ? "工号或密码不正确" : "登录失败，请检查网络后重试")
            }
        },
    })

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Card className="w-full max-w-sm">
                <CardContent>
                    <div className="mb-6 flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                            店
                        </span>
                        <div>
                            <div className="font-semibold">平台管理后台</div>
                            <div className="text-xs text-muted-foreground">请使用员工账号登录</div>
                        </div>
                    </div>
                    <form.AppForm>
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
                                        label="工号"
                                        autoComplete="username"
                                        required
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name="password">
                                {(field) => (
                                    <field.TextField
                                        label="密码"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                    />
                                )}
                            </form.AppField>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <form.Subscribe selector={(s) => s.isSubmitting}>
                                {(isSubmitting) => (
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting && <Spinner />}登录
                                    </Button>
                                )}
                            </form.Subscribe>
                        </form>
                    </form.AppForm>
                </CardContent>
            </Card>
        </div>
    )
}
