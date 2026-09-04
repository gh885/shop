import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { CircleAlert, Loader2, LogOut, Monitor, Smartphone } from "lucide-react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthApi } from "@shop/api/sdk"
import { Button, Empty, EmptyHeader, EmptyTitle, Skeleton, useAppForm } from "@shop/ui-web"

import { getDeviceId } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"

export const Route = createFileRoute("/_protected/account/security/")({
    component: SecurityPage,
    head: () => ({
        meta: [{ title: "安全设置 - 个人中心 - Shop" }],
    }),
})

const DEVICES_KEY = ["devices"] as const

/** 安全设置：修改登录密码 + 登录设备管理（列表/单设备退出/退出全部）。 */
function SecurityPage() {
    return (
        <div className="space-y-6">
            <ChangePassword />
            <DeviceManager />
        </div>
    )
}

// ---------- 修改密码 ----------

function ChangePassword() {
    const [error, setError] = useState<string | undefined>()

    const change = useMutation({
        mutationFn: ({ current, next }: { current: string; next: string }) =>
            AuthApi.setPassword({ body: { currentPassword: current, newPassword: next } }),
        onSuccess: () => {
            notify.success("密码已修改")
            // 改密后端已吊销全部会话；清除本地登录态，引导重新登录
            window.location.href = "/"
        },
        onError: (e) => setError(toDetail(e)),
    })

    const form = useAppForm({
        defaultValues: { current: "", next: "", confirm: "" },
        validators: {
            onSubmit: ({ value }) => {
                if (value.current.length === 0) return { fields: { current: "请输入当前密码" } }
                if (value.next.length < 8) return { fields: { next: "新密码至少 8 位" } }
                if (value.next !== value.confirm) return { fields: { confirm: "两次输入不一致" } }
                return
            },
        },
        onSubmit: ({ value }) => change.mutate({ current: value.current, next: value.next }),
    })

    return (
        <section className="space-y-4 rounded-2xl bg-background p-6">
            <div>
                <h2 className="text-base font-semibold">修改登录密码</h2>
                <p className="text-sm text-muted-foreground">
                    修改后所有设备将退出登录，需重新验证。
                </p>
            </div>

            <form
                className="max-w-md space-y-3"
                onSubmit={(e) => {
                    e.preventDefault()
                    form.handleSubmit()
                }}
            >
                <form.AppField name="current">
                    {(field) => (
                        <field.TextField
                            type="password"
                            placeholder="当前密码"
                            autoComplete="current-password"
                        />
                    )}
                </form.AppField>
                <form.AppField name="next">
                    {(field) => (
                        <field.TextField
                            type="password"
                            placeholder="新密码（至少 8 位）"
                            autoComplete="new-password"
                        />
                    )}
                </form.AppField>
                <form.AppField name="confirm">
                    {(field) => (
                        <field.TextField
                            type="password"
                            placeholder="确认新密码"
                            autoComplete="new-password"
                        />
                    )}
                </form.AppField>

                {error && (
                    <p className="flex items-center gap-1.5 text-[13px] text-destructive">
                        <CircleAlert className="size-3.5 shrink-0" />
                        {error}
                    </p>
                )}

                <Button
                    type="submit"
                    disabled={change.isPending}
                    className="w-28"
                >
                    {change.isPending ? <Loader2 className="animate-spin" /> : "确认修改"}
                </Button>
            </form>
        </section>
    )
}

// ---------- 设备管理 ----------

function DeviceManager() {
    const qc = useQueryClient()
    const currentDeviceId = getDeviceId()

    const devices = useQuery({
        queryKey: DEVICES_KEY,
        queryFn: () => AuthApi.devices({ query: { currentDeviceId } }),
    })

    const deleteDevice = useMutation({
        mutationFn: (deviceId: string) => AuthApi.deleteDevice({ path: { deviceId } }),
        onSuccess: () => {
            notify.success("已退出该设备")
            void qc.invalidateQueries({ queryKey: DEVICES_KEY })
        },
        onError: (e) => notify.fromError(e, "退出失败"),
    })

    const logoutAll = useMutation({
        mutationFn: () => AuthApi.logoutAll(),
        onSuccess: () => {
            notify.success("已退出所有设备")
            window.location.href = "/"
        },
        onError: (e) => notify.fromError(e, "退出失败"),
    })

    return (
        <section className="space-y-4 rounded-2xl bg-background p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold">登录设备</h2>
                    <p className="text-sm text-muted-foreground">
                        管理已登录的设备，退出可疑设备以保护账号。
                    </p>
                </div>
                <Button
                    variant="outline"
                    disabled={logoutAll.isPending || devices.data?.length === 0}
                    onClick={() => logoutAll.mutate()}
                >
                    {logoutAll.isPending ? <Loader2 className="animate-spin" /> : "退出所有设备"}
                </Button>
            </div>

            <div className="space-y-2">
                {devices.isLoading ? (
                    Array.from({ length: 3 }, (_, i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full"
                        />
                    ))
                ) : devices.data?.length === 0 ? (
                    <Empty className="py-6">
                        <EmptyHeader>
                            <EmptyTitle>暂无其他登录设备</EmptyTitle>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    devices.data?.map((d) => (
                        <div
                            key={d.deviceId}
                            className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3"
                        >
                            {isMobileName(d.deviceName ?? "") ? (
                                <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                            ) : (
                                <Monitor className="size-5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {d.deviceName}
                                    {d.isCurrent && (
                                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                            本机
                                        </span>
                                    )}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {d.ip ?? "未知 IP"} · {formatTime(d.lastLoginAt)}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={d.isCurrent || deleteDevice.isPending}
                                onClick={() => deleteDevice.mutate(d.deviceId ?? "")}
                            >
                                <LogOut className="size-4" />
                                退出
                            </Button>
                        </div>
                    ))
                )}
            </div>
        </section>
    )
}

// ---------- 工具 ----------

function isMobileName(name: string): boolean {
    const n = name.toLowerCase()
    return n.includes("iphone") || n.includes("android") || n.includes("手机")
}

function formatTime(iso: string | undefined): string {
    if (!iso) return "时间未知"
    try {
        return new Date(iso).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        })
    } catch {
        return "时间未知"
    }
}

function toDetail(e: unknown): string {
    if (typeof e === "object" && e !== null && "detail" in e)
        return String((e as { detail: unknown }).detail)
    return "操作失败，请重试"
}
