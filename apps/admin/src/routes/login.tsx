import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useMemo, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"

import { AdminAuthApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common"
import {
    LocaleSwitcher,
    serverFieldErrorTexts,
    submitForm,
    translateSidebarItems,
    useI18n,
    usePasswordVisibility,
} from "@shop/app-kit"
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

/** 与后端登录 @NotBlank 类校验对齐；文案随 locale 走，故在组件内构造 */
const loginSchema = (required: { employeeNo: string; password: string }) =>
    z.object({
        employeeNo: z.string().trim().min(1, required.employeeNo),
        password: z.string().min(1, required.password),
    })

/** 两个输入框的差异全部收敛到这里，渲染只有一份 */
const FIELDS = [
    {
        name: "employeeNo",
        label: "admin.login.employeeNo",
        type: "text",
        autoComplete: "username",
    },
    {
        name: "password",
        label: "admin.login.password",
        type: "password",
        autoComplete: "current-password",
    },
] as const

function LoginPage() {
    const t = useT()
    const { locale } = useI18n()
    const navigate = Route.useNavigate()
    const [loginError, setLoginError] = useState<string | undefined>()
    const panelRef = useRef<HTMLDivElement>(null)
    // 本页只一个密码框，小眼睛的状态挂在页级即可
    const password = usePasswordVisibility()

    // 失败反馈：表单整体轻抖一下
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
                employeeNo: t("admin.login.employeeNoRequired"),
                password: t("admin.login.passwordRequired"),
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
                // 两条通道分开：422 的字段级明细（工号/口令的长度与形状）落进对应输入框；
                // 落得到的那一条不再重复走底部通用错误。凭证错误是 401 那一类，从来不带 errors[]，
                // 所以 texts 为空时仍回到既有那句（401 → 账号或口令错误，其余 → 通用失败）。
                // deviceId 由 getDeviceId() 生成、页面上没有对应输入框，不进白名单——宁可少落
                const texts = serverFieldErrorTexts(error, locale, {
                    employeeNo: "employeeNo",
                    password: "password",
                })
                applyServerFieldErrors(form, texts)
                if (Object.keys(texts).length === 0) {
                    // 401 才是凭证错误；网络错误/服务端故障如实提示，避免误导成密码错误
                    const apiErr = toApiError(error)
                    setLoginError(
                        apiErr.status === 401
                            ? t("admin.login.invalidCredentials")
                            : t("admin.login.failed"),
                    )
                }
                shake()
                // 原样抛出：表单状态（isSubmitSuccessful）交给 form-core 判定，
                // 接住 rejection 是 submitForm 的事——登录不是 mutation，这里没人替我们报监控
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
                    <h1 className="text-4xl font-semibold">{t("admin.login.title")}</h1>
                    <p className="mt-3 text-muted-foreground">{t("admin.login.subtitle")}</p>

                    <form
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault()
                            // 不写 void form.handleSubmit()：catch 里 rethrow 的那条会变成未处理的
                            // 异步异常，submitForm 接住它并按种类分开处置（见它的注释）
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
                        {/* 登录不是 mutation（token 直接落本地），加载态只能读表单自己的 isSubmitting */}
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => <SubmitButton disabled={isSubmitting} />}
                        </form.Subscribe>
                    </form>
                </div>

                <p className="text-xs tracking-wider text-muted-foreground">
                    {t("admin.login.restricted")}
                </p>
            </section>
        </div>
    )
}

/** 左栏：把后台真实的模块排成一页「目录」——内容取自导航数据，模块增减自动跟上 */
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
    const today = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date()),
        [locale],
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
                    {t("admin.login.contents")}
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
                {t("admin.login.logo")}
            </span>
            <span className="font-semibold">{t("admin.layout.brand")}</span>
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
            {t("admin.login.submit")}
            {disabled ? (
                <Spinner />
            ) : (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            )}
        </button>
    )
}
