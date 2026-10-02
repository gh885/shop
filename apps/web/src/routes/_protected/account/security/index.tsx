import { LogOut, Monitor, Smartphone } from "lucide-react"

import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    confirm,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    FormError,
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
    PasswordToggle,
    Skeleton,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { getDeviceId } from "#/shared/api/auth"
import { DeletionCard, deviceKeys, devicesOptions, isMobileDeviceName } from "#/account"
import { useT } from "#/locales/use-t"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { formatTimeShort } from "@shop/app-kit/display"
import { serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { usePasswordVisibility } from "@shop/app-kit/auth"
import { toApiError } from "@shop/common/contract"
import { AuthApi, type DeviceEntryResponse } from "@shop/api/sdk"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useState } from "react"

export const Route = createFileRoute("/_protected/account/security/")({
    component: SecurityPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.security", match.context.locale) }],
    }),
})

/** 安全设置：修改登录密码 + 登录设备管理（列表/单设备退出/退出全部）+ 账号注销（申请/撤销）。 */
function SecurityPage() {
    const t = useT()
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("web.security.title")}</h2>

            <div className="space-y-6">
                <ChangePassword />
                <DeviceManager />
                <DeletionCard />
            </div>
        </div>
    )
}

/** 三个密码框的差异收在一处，渲染只走一份——和 admin 登录页的 FIELDS 同一个路子 */
const PASSWORD_FIELDS = [
    {
        name: "current",
        label: "web.security.changePassword.current",
        placeholder: "web.security.changePassword.currentPlaceholder",
        autoComplete: "current-password",
    },
    {
        name: "next",
        label: "web.security.changePassword.next",
        placeholder: "web.security.changePassword.nextPlaceholder",
        autoComplete: "new-password",
    },
    {
        name: "confirm",
        label: "web.security.changePassword.confirm",
        placeholder: "web.security.changePassword.confirmPlaceholder",
        autoComplete: "new-password",
    },
] as const

/**
 * 密码字段 = TextField + 一颗小眼睛。
 *
 * 为什么要多这一层：眼睛的显隐状态是 React state，而 AppField 的 render prop 里不能调 hook，
 * 所以得有一个真组件来持有它——三个字段各自一颗眼睛（点开「当前密码」不该连带把「新密码」
 * 也亮出来）。
 *
 * `field` 只用到它上面绑好的 TextField，所以用结构化类型声明，不往 app 里引
 * @tanstack/react-form 的内部类型。
 */
function PasswordTextField({
    field,
    label,
    placeholder,
    autoComplete,
}: {
    field: { TextField: React.ComponentType<TextFieldSlotProps> }
    label: string
    placeholder: string
    autoComplete: string
}) {
    const password = usePasswordVisibility()
    const { TextField } = field
    return (
        <TextField
            type={password.inputType}
            label={label}
            placeholder={placeholder}
            autoComplete={autoComplete}
            trailing={<PasswordToggle {...password.toggleProps} />}
        />
    )
}

type TextFieldSlotProps = {
    type?: React.ComponentProps<"input">["type"]
    label: string
    placeholder: string
    autoComplete: string
    trailing?: React.ReactNode
}

// 修改密码
function ChangePassword() {
    const t = useT()
    const { locale } = useI18n()
    const [formError, setFormError] = useState<string | undefined>()

    const change = useMutation({
        mutationFn: ({ current, next }: { current: string; next: string }) =>
            AuthApi.setPassword({ body: { currentPassword: current, newPassword: next } }),
        // 不再 silentError：改回全局 toast 这条通道（范本双通道之一）；
        // 字段级落红在表单的 catch 里补，二者并存。成功仍由 meta.success 提示
        meta: { success: t("web.security.changePassword.success") },
        onSuccess: () => {
            // 改密后端已吊销全部会话；清除本地登录态，引导重新登录
            window.location.href = "/"
        },
    })

    const form = useAppForm({
        defaultValues: { current: "", next: "", confirm: "" },
        validators: {
            onSubmit: ({ value }) => {
                if (value.current.length === 0)
                    return {
                        fields: {
                            current: t("web.security.changePassword.currentRequired"),
                        },
                    }
                if (value.next.length < 8)
                    return {
                        fields: { next: t("web.security.changePassword.nextTooShort") },
                    }
                if (value.next !== value.confirm)
                    return {
                        fields: { confirm: t("web.security.changePassword.mismatch") },
                    }
                return
            },
        },
        // 范本双通道：422 字段级明细落 current/next 框（confirm 只是本地二次确认，无 DTO 对边），
        // 其余按 code 的错误（如「当前密码错误」那条 401，没有对应输入框）留在底部 FormError；
        // 全局 toast 也已随 silentError 解除而回来。抛回交给 submitForm 兜住
        onSubmit: async ({ value }) => {
            try {
                await change.mutateAsync({ current: value.current, next: value.next })
            } catch (error) {
                const texts = serverFieldErrorTexts(error, locale, {
                    currentPassword: "current",
                    newPassword: "next",
                })
                applyServerFieldErrors(form, texts)
                setFormError(
                    Object.keys(texts).length === 0
                        ? errorText(toApiError(error), locale)
                        : undefined,
                )
                throw error
            }
        },
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("web.security.changePassword.title")}</CardTitle>
                <CardDescription>{t("web.security.changePassword.description")}</CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="max-w-md space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submitForm(form)
                    }}
                >
                    {PASSWORD_FIELDS.map((spec) => (
                        <form.AppField
                            key={spec.name}
                            name={spec.name}
                        >
                            {(field) => (
                                <PasswordTextField
                                    field={field}
                                    label={t(spec.label)}
                                    placeholder={t(spec.placeholder)}
                                    autoComplete={spec.autoComplete}
                                />
                            )}
                        </form.AppField>
                    ))}

                    <FormError>{formError}</FormError>

                    <Button
                        type="submit"
                        disabled={change.isPending}
                        className="w-28"
                    >
                        {change.isPending && <Spinner />}
                        {t("web.security.changePassword.submit")}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

// 设备管理
// 两个 mutation + 一个查询 + 一层卡片壳的长度；列表与行已各自拆出，
// 再拆只会把「本页有哪些写操作」拆散到读不到的地方
// fallow-ignore-next-line complexity
function DeviceManager() {
    const t = useT()
    const currentDeviceId = getDeviceId()

    const devices = useQuery(devicesOptions(currentDeviceId))

    const deleteDevice = useMutation({
        mutationFn: (deviceId: string) => AuthApi.deleteDevice({ path: { deviceId } }),
        meta: {
            success: t("web.security.devices.logoutOne"),
            error: t("web.security.devices.logoutFailed"),
            // 前缀失效：all 覆盖 list(currentDeviceId) 这条带设备 id 的 key
            invalidates: [deviceKeys.all],
        },
    })

    // 退出全部设备：成功后整页跳转（不做缓存失效），且不是「写一处数据」而是会话终结 ——
    // 因此只有提示走全局 meta，成功回调只负责跳转
    const logoutAll = useMutation({
        mutationFn: () => AuthApi.logoutAll(),
        meta: {
            success: t("web.security.devices.logoutAll"),
            error: t("web.security.devices.logoutFailed"),
        },
        onSuccess: () => {
            window.location.href = "/"
        },
    })

    // 行级删除指示：记录正在退出的设备， Spinner 只显示在对应行
    const [deletingId, setDeletingId] = useState<string | undefined>()

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("web.security.devices.title")}</CardTitle>
                <CardDescription>{t("web.security.devices.description")}</CardDescription>
                <CardAction>
                    <Button
                        variant="outline"
                        disabled={logoutAll.isPending || devices.data?.length === 0}
                        onClick={() => {
                            void confirm({
                                title: t("web.security.devices.logoutAllTitle"),
                                description: t("web.security.devices.logoutAllConfirm"),
                                confirmText: t("web.security.devices.logoutAllAction"),
                                action: () => logoutAll.mutateAsync(),
                            })
                        }}
                    >
                        {logoutAll.isPending ? (
                            <Spinner />
                        ) : (
                            t("web.security.devices.logoutAllAction")
                        )}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {/* 加载骨架在调用点二选一（DESIGN.md：不把 isPending 传进展示组件）：
                    DeviceList 只认「有设备 / 没设备」两态，否则 loading 布尔会与
                    devices 的空数组混成「加载中」和「真的没有设备」两种含义 */}
                {devices.isPending ? (
                    <DeviceListSkeleton />
                ) : (
                    <DeviceList
                        devices={devices.data ?? []}
                        deletingId={deletingId}
                        busy={deleteDevice.isPending}
                        onSignOut={(deviceId) => {
                            setDeletingId(deviceId)
                            deleteDevice.mutate(deviceId, {
                                onSettled: () => setDeletingId(undefined),
                            })
                        }}
                    />
                )}
            </CardContent>
        </Card>
    )
}

/** 设备列表加载骨架：三行对齐真实行高（h-14），避免列表到位时跳版 */
function DeviceListSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
                <Skeleton
                    key={i}
                    className="h-14 w-full"
                />
            ))}
        </div>
    )
}

/**
 * 设备列表：空态 / 行列表两分支（加载骨架由调用点二选一，见上）。
 *
 * `deletingId` / `busy` 仍作为 props 下传：它们是**交互瞬态**（「哪一行正在退出」）而不是数据三态，
 * 行级 Spinner 定位与按钮按住都需要这份信息，在调用点折算成视图模型反而更绕。
 */
function DeviceList({
    devices,
    deletingId,
    busy,
    onSignOut,
}: {
    devices: readonly DeviceEntryResponse[]
    deletingId: string | undefined
    /** 是否有行正在退出：在途时所有行的按钮都按住 */
    busy: boolean
    onSignOut: (deviceId: string) => void
}) {
    const t = useT()
    if (devices.length === 0) {
        return (
            <Empty className="py-6">
                <EmptyHeader>
                    <EmptyTitle>{t("web.security.devices.empty.title")}</EmptyTitle>
                    <EmptyDescription>
                        {t("web.security.devices.empty.description")}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }
    return (
        <div className="space-y-2">
            {devices.map((d) => (
                <DeviceRow
                    key={d.deviceId}
                    device={d}
                    deleting={deletingId === d.deviceId && busy}
                    busy={busy}
                    onSignOut={() => onSignOut(d.deviceId)}
                />
            ))}
        </div>
    )
}

/** 设备行：图标 + 名称（本机带角标）+ IP·时间 + 退出按钮 */
// 一行就是一段平铺的 JSX（图标/标题/描述/按钮），拆下去只会把一行拆成四个小组件
// fallow-ignore-next-line complexity
function DeviceRow({
    device,
    deleting,
    busy,
    onSignOut,
}: {
    device: DeviceEntryResponse
    /** 本行正在退出：换成 Spinner */
    deleting: boolean
    /** 任一行正在退出：所有行的按钮都按住 */
    busy: boolean
    onSignOut: () => void
}) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <Item
            variant="outline"
            size="lg"
        >
            <ItemMedia variant="icon">
                {isMobileDeviceName(device.deviceName) ? <Smartphone /> : <Monitor />}
            </ItemMedia>
            <ItemContent>
                <ItemTitle className="truncate">
                    {device.deviceName}
                    {device.isCurrent && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-3xs text-primary-subtle-foreground">
                            {t("web.security.devices.current")}
                        </span>
                    )}
                </ItemTitle>
                <ItemDescription className="truncate">
                    {device.ip ?? t("web.security.devices.unknownIp")} ·{" "}
                    {formatTimeShort(device.lastLoginAt, locale)}
                </ItemDescription>
            </ItemContent>
            <ItemActions>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={device.isCurrent || busy}
                    onClick={onSignOut}
                >
                    {deleting ? <Spinner className="size-4" /> : <LogOut className="size-4" />}
                    {t("web.security.devices.logout")}
                </Button>
            </ItemActions>
        </Item>
    )
}
