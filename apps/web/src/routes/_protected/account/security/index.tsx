import { CircleAlert, LogOut, Monitor, Smartphone } from "lucide-react"

import { notify } from "@shop/app-kit"
import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    ConfirmDialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
    Skeleton,
    Spinner,
    useAppForm,
} from "@shop/ui-web"
import { getDeviceId } from "#/shared/api/auth"
import { formatTimeShort, useWriteMutation } from "@shop/app-kit"
import { toApiError } from "@shop/common"
import { AuthApi } from "@shop/api/sdk"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

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
        onError: (e) => setError(toApiError(e).detail),
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
        <Card>
            <CardHeader>
                <CardTitle>修改登录密码</CardTitle>
                <CardDescription>修改后所有设备将退出登录，需重新验证。</CardDescription>
            </CardHeader>
            <CardContent>
                {/* React 19 form action：React 自动接管提交（无需 preventDefault），校验仍走 TanStack Form */}
                <form
                    className="max-w-md space-y-3"
                    action={() => void form.handleSubmit()}
                >
                    <form.AppField name="current">
                        {(field) => (
                            <field.TextField
                                type="password"
                                label="当前密码"
                                placeholder="请输入当前密码"
                                autoComplete="current-password"
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="next">
                        {(field) => (
                            <field.TextField
                                type="password"
                                label="新密码"
                                placeholder="至少 8 位"
                                autoComplete="new-password"
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="confirm">
                        {(field) => (
                            <field.TextField
                                type="password"
                                label="确认新密码"
                                placeholder="再次输入新密码"
                                autoComplete="new-password"
                            />
                        )}
                    </form.AppField>

                    {error && (
                        <p className="flex items-center gap-1.5 text-2xs text-destructive">
                            <CircleAlert className="size-3.5 shrink-0" />
                            {error}
                        </p>
                    )}

                    <Button
                        type="submit"
                        disabled={change.isPending}
                        className="w-28"
                    >
                        {change.isPending ? <Spinner /> : "确认修改"}
                    </Button>
                </form>
            </CardContent>
        </Card>
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

    const deleteDevice = useWriteMutation<string>({
        mutationFn: (deviceId) => AuthApi.deleteDevice({ path: { deviceId } }),
        invalidate: () => void qc.invalidateQueries({ queryKey: DEVICES_KEY }),
        messages: { success: "已退出该设备", error: "退出失败" },
    })

    // 退出全部设备：成功后整页跳转（不做缓存失效），且不是「写一处数据」而是会话终结 ——
    // 保持裸 useMutation，不套工厂（工厂的 success toast + invalidate 在这里都不适用）
    const logoutAll = useMutation({
        mutationFn: () => AuthApi.logoutAll(),
        onSuccess: () => {
            notify.success("已退出所有设备")
            window.location.href = "/"
        },
        onError: (e) => notify.fromError(e, "退出失败"),
    })

    const [logoutAllOpen, setLogoutAllOpen] = useState(false)
    // 行级删除指示：记录正在退出的设备， Spinner 只显示在对应行
    const [deletingId, setDeletingId] = useState<string | undefined>()

    return (
        <Card>
            <CardHeader>
                <CardTitle>登录设备</CardTitle>
                <CardDescription>管理已登录的设备，退出可疑设备以保护账号。</CardDescription>
                <CardAction>
                    <Button
                        variant="outline"
                        disabled={logoutAll.isPending || devices.data?.length === 0}
                        onClick={() => setLogoutAllOpen(true)}
                    >
                        {logoutAll.isPending ? <Spinner /> : "退出所有设备"}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
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
                                <EmptyDescription>
                                    只有当前设备在登录，账号是安全的。
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        devices.data?.map((d) => (
                            <Item
                                key={d.deviceId}
                                variant="outline"
                                size="lg"
                            >
                                <ItemMedia variant="icon">
                                    {isMobileName(d.deviceName) ? <Smartphone /> : <Monitor />}
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle className="truncate">
                                        {d.deviceName}
                                        {d.isCurrent && (
                                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-3xs text-primary">
                                                本机
                                            </span>
                                        )}
                                    </ItemTitle>
                                    <ItemDescription className="truncate">
                                        {d.ip ?? "未知 IP"} · {formatTimeShort(d.lastLoginAt)}
                                    </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={d.isCurrent || deleteDevice.isPending}
                                        onClick={() => {
                                            setDeletingId(d.deviceId)
                                            deleteDevice.mutate(d.deviceId, {
                                                onSettled: () => setDeletingId(undefined),
                                            })
                                        }}
                                    >
                                        {deletingId === d.deviceId && deleteDevice.isPending ? (
                                            <Spinner className="size-4" />
                                        ) : (
                                            <LogOut className="size-4" />
                                        )}
                                        退出
                                    </Button>
                                </ItemActions>
                            </Item>
                        ))
                    )}
                </div>

                {/* 退出所有设备二次确认 */}
                <ConfirmDialog
                    open={logoutAllOpen}
                    onOpenChange={setLogoutAllOpen}
                    title="退出所有设备"
                    description="将退出包括本机在内的所有登录会话，确定继续吗？"
                    confirmText="退出所有设备"
                    pending={logoutAll.isPending}
                    onConfirm={() => logoutAll.mutate()}
                />
            </CardContent>
        </Card>
    )
}

// ---------- 工具 ----------

function isMobileName(name: string | null): boolean {
    if (!name) return false
    const n = name.toLowerCase()
    return n.includes("iphone") || n.includes("android") || n.includes("手机")
}
