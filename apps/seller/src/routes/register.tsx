import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { z } from "zod"

import { SellerRegisterControllerApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { SubmitButton, usePasswordVisibility } from "@shop/app-kit/auth"
import { FormError, PasswordToggle, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { authState, bootstrapAuth, tokenStore } from "#/shared/lib/api"
import { useClearMe } from "#/shared/lib/me"

export const Route = createFileRoute("/register")({
    // 已登录由守卫跳走，与登录页同一口径
    beforeLoad: async () => {
        await bootstrapAuth()
        if (authState.getStatus() === "authed") throw redirect({ to: "/" })
    },
    component: RegisterPage,
})

const registerSchema = (required: {
    shopName: string
    loginName: string
    loginNameInvalid: string
    password: string
    passwordWeak: string
}) =>
    z.object({
        name: z.string().trim().min(1, required.shopName),
        loginName: z
            .string()
            .trim()
            .min(3, required.loginNameInvalid)
            .max(30, required.loginNameInvalid)
            .regex(/^[a-zA-Z0-9_-]+$/, required.loginNameInvalid),
        password: z.string().min(8, required.passwordWeak),
    })

function RegisterPage() {
    const t = useT()

    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-sm animate-in duration-700 fade-in fill-mode-both slide-in-from-bottom-2">
                    <h1 className="text-3xl font-semibold">{t("register.title")}</h1>
                    <p className="mt-2 text-muted-foreground">{t("register.description")}</p>
                    <RegisterForm />
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        <Link
                            to="/login"
                            className="underline underline-offset-4 hover:text-foreground"
                        >
                            {t("login.toLogin")}
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    )
}

function RegisterForm() {
    const t = useT()
    const navigate = useNavigate()
    const clearMe = useClearMe()
    const password = usePasswordVisibility()
    const [registerError, setRegisterError] = useState<string | undefined>()
    const formRef = useRef<HTMLDivElement>(null)

    const form = useAppForm({
        defaultValues: { name: "", loginName: "", password: "" },
        validators: {
            onSubmit: registerSchema({
                shopName: t("register.shopNameRequired"),
                loginName: t("register.loginNameRequired"),
                loginNameInvalid: t("register.loginNameInvalid"),
                password: t("register.passwordRequired"),
                passwordWeak: t("register.passwordWeak"),
            }),
        },
        onSubmit: async ({ value }) => {
            setRegisterError(undefined)
            try {
                const res = await SellerRegisterControllerApi.register({
                    body: {
                        name: value.name.trim(),
                        loginName: value.loginName.trim(),
                        password: value.password,
                    },
                })
                if (!res.accessToken) throw new Error("注册响应缺少 accessToken")
                // 注册即签发会话：与登录同一顺序——先清身份缓存再写令牌
                clearMe()
                tokenStore.set(res.accessToken)
                await navigate({ to: "/", replace: true })
            } catch (error) {
                const texts = serverFieldErrors(error, {
                    name: "name",
                    loginName: "loginName",
                    password: "password",
                })
                // 撞登录名唯一索引不带 errors 列表：按码分支把输入框标红
                if (
                    Object.keys(texts).length === 0 &&
                    toApiError(error).code === "LOGIN_NAME_TAKEN"
                ) {
                    texts.loginName = t("register.loginNameTaken")
                }
                applyServerFieldErrors(form, texts)
                if (Object.keys(texts).length === 0) {
                    setRegisterError(t("register.failed"))
                }
                throw error
            }
        },
    })

    return (
        <div
            ref={formRef}
            className="mt-8"
        >
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
                className="space-y-8"
            >
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("register.shopName")}
                            type="text"
                            autoComplete="organization"
                        />
                    )}
                </form.AppField>
                <form.AppField name="loginName">
                    {(field) => (
                        <field.TextField
                            label={t("register.loginName")}
                            type="text"
                            autoComplete="username"
                        />
                    )}
                </form.AppField>
                <form.AppField name="password">
                    {(field) => (
                        <field.TextField
                            label={t("register.password")}
                            type={password.inputType}
                            autoComplete="new-password"
                            trailing={<PasswordToggle {...password.toggleProps} />}
                        />
                    )}
                </form.AppField>
                <FormError>{registerError}</FormError>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("register.submit")}
                            className="w-full"
                        />
                    )}
                </form.Subscribe>
            </form>
        </div>
    )
}
