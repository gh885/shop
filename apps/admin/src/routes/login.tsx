import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useMemo, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"

import { AdminAuthApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
import { PLATFORM_TIME_ZONE } from "@shop/i18n"
import { LocaleSwitcher, useI18n } from "@shop/app-kit/i18n"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { translateSidebarItems } from "@shop/app-kit/shell"
import { usePasswordVisibility } from "@shop/app-kit/auth"
import {
    FormError,
    PasswordToggle,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
    type CSSVars,
    cn,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { getDeviceId, requireGuest, tokenStore } from "../shared/lib/api"
import { NAV_SOURCE_ITEMS } from "../layout/nav"

export const Route = createFileRoute("/login")({
    beforeLoad: requireGuest,
    component: LoginPage,
})

const loginSchema = (required: { employeeNo: string; password: string }) =>
    z.object({
        employeeNo: z.string().trim().min(1, required.employeeNo),
        password: z.string().min(1, required.password),
    })

const FIELDS = [
    {
        name: "employeeNo",
        label: "login.employeeNo",
        type: "text",
        autoComplete: "username",
    },
    {
        name: "password",
        label: "login.password",
        type: "password",
        autoComplete: "current-password",
    },
] as const

function LoginPage() {
    const t = useT()
    const navigate = Route.useNavigate()
    const [loginError, setLoginError] = useState<string | undefined>()
    const panelRef = useRef<HTMLDivElement>(null)
    const password = usePasswordVisibility()

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
        defaultValues: { employeeNo: "", password: "" },
        validators: {
            onSubmit: loginSchema({
                employeeNo: t("login.employeeNoRequired"),
                password: t("login.passwordRequired"),
            }),
        },
        onSubmitInvalid: shake,
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
                const texts = serverFieldErrors(error, {
                    employeeNo: "employeeNo",
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
        <div className="grid min-h-dvh bg-card lg:grid-cols-12">
            <Contents />

            <section className="flex flex-col p-6 sm:p-10 lg:col-span-5 lg:border-l lg:border-border">
                <div className="flex items-center justify-between lg:justify-end">
                    <Brand className="lg:hidden" />
                    <LocaleSwitcher />
                </div>

                <div
                    ref={panelRef}
                    className="mx-auto my-auto w-full max-w-sm animate-in py-16 duration-700 fade-in fill-mode-both slide-in-from-bottom-2"
                >
                    <h1 className="text-4xl font-semibold">{t("login.title")}</h1>
                    <p className="mt-3 text-muted-foreground">{t("login.subtitle")}</p>

                    <form
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault()
                            // 用 submitForm 而非 form.handleSubmit()：后者会把 rethrow 变成未处理异常，由 submitForm 分流
                            void submitForm(form)
                        }}
                        className="mt-12 space-y-8"
                    >
                        {FIELDS.map((spec) => {
                            const isPassword = spec.name === "password"
                            return (
                                <form.AppField
                                    key={spec.name}
                                    name={spec.name}
                                >
                                    {(field) => (
                                        <field.TextField
                                            label={t(spec.label)}
                                            type={isPassword ? password.inputType : spec.type}
                                            autoComplete={spec.autoComplete}
                                            className={cn(
                                                "login-line",
                                                isPassword && "login-line-has-trailing",
                                            )}
                                            trailing={
                                                isPassword ? (
                                                    <PasswordToggle {...password.toggleProps} />
                                                ) : undefined
                                            }
                                        />
                                    )}
                                </form.AppField>
                            )
                        })}
                        <FormError>{loginError}</FormError>
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => <SubmitButton disabled={isSubmitting} />}
                        </form.Subscribe>
                    </form>
                </div>

                <p className="text-xs tracking-wider text-muted-foreground">
                    {t("login.restricted")}
                </p>
            </section>
        </div>
    )
}

function Contents() {
    const t = useT()
    const { locale } = useI18n()
    const groups = useMemo(
        () =>
            translateSidebarItems(NAV_SOURCE_ITEMS, t)
                .filter((item) => "sections" in item)
                .map((group) => ({
                    key: group.key,
                    title: group.sections[0]?.title,
                    items: group.sections
                        .flatMap((s) => s.items.map((item) => item.label))
                        .join(" · "),
                })),
        [t],
    )
    // 显式钉 PLATFORM_TIME_ZONE：省掉它 Intl 吃环境默认，SSR(UTC) 与浏览器跨零点会排出两个日期
    const [now] = useState(() => new Date())
    const today = useMemo(
        () =>
            new Intl.DateTimeFormat(locale, {
                dateStyle: "full",
                timeZone: PLATFORM_TIME_ZONE,
            }).format(now),
        [locale, now],
    )

    return (
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-canvas p-12 lg:col-span-7 lg:flex xl:p-16">
            <div
                aria-hidden
                className="bg-hairline-grid absolute inset-0"
            />
            <Brand className="relative" />

            <div className="relative">
                <p className="text-xs tracking-wider text-muted-foreground">
                    {t("login.contents")}
                </p>
                <ol className="mt-6 border-b border-border">
                    {groups.map((group, i) => (
                        <li
                            key={group.key}
                            style={{ "--i": i } as CSSVars}
                            className="stagger grid animate-in grid-cols-12 items-baseline gap-6 border-t border-border py-5 duration-700 fade-in fill-mode-both slide-in-from-bottom-3"
                        >
                            <span className="col-span-1 font-mono text-xs text-primary tabular-nums">
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="col-span-7 text-4xl 2xl:text-5xl">{group.title}</span>
                            <span className="col-span-4 text-right text-sm text-muted-foreground">
                                {group.items}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>

            <p className="relative text-xs tracking-wider text-muted-foreground">{today}</p>
        </aside>
    )
}

function Brand({ className }: { className?: string }) {
    const t = useT()
    return (
        <div className={cn("flex items-center gap-3", className)}>
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                {t("login.logo")}
            </span>
            <span className="font-semibold">{t("layout.brand")}</span>
        </div>
    )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
    const t = useT()
    return (
        <button
            type="submit"
            disabled={disabled}
            className="group flex h-12 w-full items-center justify-between rounded-md bg-primary px-5 font-medium text-primary-foreground transition-colors outline-none hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-primary-active disabled:opacity-70"
        >
            {t("login.signIn")}
            {disabled ? (
                <Spinner />
            ) : (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            )}
        </button>
    )
}
