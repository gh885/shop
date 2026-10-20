import { useRouter } from "@tanstack/react-router"
import { message } from "#/locales/message"
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
import { DeletionCard, deviceKeys, devicesOptions, isMobileDeviceName } from "#/domains/account"
import { useT } from "#/locales/use-t"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { formatTimeShort } from "@shop/app-kit/display"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { usePasswordVisibility } from "@shop/app-kit/auth"
import { toApiError } from "@shop/common/contract"
import { AuthApi, type DeviceEntryResponse } from "@shop/api/sdk"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/account/security/")({
    component: SecurityPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.security", match.context.locale) }],
    }),
})

function SecurityPage() {
    const t = useT("security")
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("security.title")}</h2>

            <div className="space-y-6">
                <ChangePassword />
                <DeviceManager />
                <DeletionCard />
            </div>
        </div>
    )
}

const PASSWORD_FIELDS = [
    {
        name: "current",
        label: "security.changePassword.current",
        placeholder: "security.changePassword.currentPlaceholder",
        autoComplete: "current-password",
    },
    {
        name: "next",
        label: "security.changePassword.next",
        placeholder: "security.changePassword.nextPlaceholder",
        autoComplete: "new-password",
    },
    {
        name: "confirm",
        label: "security.changePassword.confirm",
        placeholder: "security.changePassword.confirmPlaceholder",
        autoComplete: "new-password",
    },
] as const

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

function ChangePassword() {
    const router = useRouter()
    const t = useT("security")
    const { locale } = useI18n()
    const [formError, setFormError] = useState<string | undefined>()

    const change = useMutation({
        mutationFn: ({ current, next }: { current: string; next: string }) =>
            AuthApi.setPassword({ body: { currentPassword: current, newPassword: next } }),
        meta: { success: message("security.changePassword.success") },
        onSuccess: () => {
            // 改密后端已吊销全部会话；清除本地登录态，引导重新登录
            void router.navigate({ to: "/", reloadDocument: true })
        },
    })

    const form = useAppForm({
        defaultValues: { current: "", next: "", confirm: "" },
        validators: {
            onSubmit: ({ value }) => {
                if (value.current.length === 0)
                    return {
                        fields: {
                            current: t("security.changePassword.currentRequired"),
                        },
                    }
                if (value.next.length < 8)
                    return {
                        fields: { next: t("security.changePassword.nextTooShort") },
                    }
                if (value.next !== value.confirm)
                    return {
                        fields: { confirm: t("security.changePassword.mismatch") },
                    }
                return
            },
        },
        onSubmit: async ({ value }) => {
            try {
                await change.mutateAsync({ current: value.current, next: value.next })
            } catch (error) {
                const texts = serverFieldErrors(error, {
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
                <CardTitle>{t("security.changePassword.title")}</CardTitle>
                <CardDescription>{t("security.changePassword.description")}</CardDescription>
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
                        {t("security.changePassword.submit")}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

function DeviceManager() {
    const router = useRouter()
    const t = useT("security")
    const currentDeviceId = getDeviceId()

    const devices = useQuery(devicesOptions(currentDeviceId))

    const deleteDevice = useMutation({
        mutationFn: (deviceId: string) => AuthApi.deleteDevice({ path: { deviceId } }),
        meta: {
            success: message("security.devices.logoutOne"),
            error: message("security.devices.logoutFailed"),
            // 前缀失效：all 覆盖 list(currentDeviceId) 这条带设备 id 的 key
            invalidates: [deviceKeys.all],
        },
    })

    const logoutAll = useMutation({
        mutationFn: () => AuthApi.logoutAll(),
        meta: {
            success: message("security.devices.logoutAll"),
            error: message("security.devices.logoutFailed"),
        },
        onSuccess: () => {
            void router.navigate({ to: "/", reloadDocument: true })
        },
    })

    const [deletingId, setDeletingId] = useState<string | undefined>()

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("security.devices.title")}</CardTitle>
                <CardDescription>{t("security.devices.description")}</CardDescription>
                <CardAction>
                    <Button
                        variant="outline"
                        disabled={logoutAll.isPending || devices.data?.length === 0}
                        onClick={() => {
                            void confirm({
                                title: t("security.devices.logoutAllTitle"),
                                description: t("security.devices.logoutAllConfirm"),
                                confirmText: t("security.devices.logoutAllAction"),
                                action: () => logoutAll.mutateAsync(),
                            })
                        }}
                    >
                        {logoutAll.isPending ? <Spinner /> : t("security.devices.logoutAllAction")}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {devices.isPending ? (
                    <DeviceListSkeleton />
                ) : (
                    <DeviceList
                        devices={devices.data ?? []}
                        deletingId={deletingId}
                        anyRowPending={deleteDevice.isPending}
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

function DeviceList({
    devices,
    deletingId,
    anyRowPending,
    onSignOut,
}: {
    devices: readonly DeviceEntryResponse[]
    deletingId: string | undefined
    anyRowPending: boolean
    onSignOut: (deviceId: string) => void
}) {
    const t = useT("security")
    if (devices.length === 0) {
        return (
            <Empty className="py-6">
                <EmptyHeader>
                    <EmptyTitle>{t("security.devices.empty.title")}</EmptyTitle>
                    <EmptyDescription>{t("security.devices.empty.description")}</EmptyDescription>
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
                    thisRowSigningOut={deletingId === d.deviceId && anyRowPending}
                    anyRowPending={anyRowPending}
                    onSignOut={() => onSignOut(d.deviceId)}
                />
            ))}
        </div>
    )
}

function DeviceRow({
    device,
    thisRowSigningOut,
    anyRowPending,
    onSignOut,
}: {
    device: DeviceEntryResponse
    thisRowSigningOut: boolean
    anyRowPending: boolean
    onSignOut: () => void
}) {
    const { locale } = useI18n()
    const t = useT("security")
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
                            {t("security.devices.current")}
                        </span>
                    )}
                </ItemTitle>
                <ItemDescription className="truncate">
                    {device.ip ?? t("security.devices.unknownIp")} ·{" "}
                    {formatTimeShort(device.lastLoginAt, locale)}
                </ItemDescription>
            </ItemContent>
            <ItemActions>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={device.isCurrent || anyRowPending}
                    onClick={onSignOut}
                >
                    {thisRowSigningOut ? (
                        <Spinner className="size-4" />
                    ) : (
                        <LogOut className="size-4" />
                    )}
                    {t("security.devices.logout")}
                </Button>
            </ItemActions>
        </Item>
    )
}
