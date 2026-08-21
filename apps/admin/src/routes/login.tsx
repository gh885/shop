import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { Button, Input } from "@shop/ui-web"

import { adminApi, requireGuest } from "../lib/api"
import { getDeviceId, tokenStore } from "../lib/auth"

export const Route = createFileRoute("/login")({
    beforeLoad: requireGuest,
    component: LoginPage,
})

function LoginPage() {
    const navigate = Route.useNavigate()
    const [employeeNo, setEmployeeNo] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        try {
            const result = await adminApi.login({
                employeeNo: employeeNo.trim(),
                password,
                deviceId: getDeviceId(),
            })
            tokenStore.set(result.accessToken)
            void navigate({ to: "/", search: { page: 1, size: 20 } })
        } catch {
            setError("工号或密码不正确")
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
                <div className="mb-6 flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                        店
                    </span>
                    <div>
                        <div className="font-semibold">平台管理后台</div>
                        <div className="text-xs text-muted-foreground">请使用员工账号登录</div>
                    </div>
                </div>
                <form
                    onSubmit={(e) => void submit(e)}
                    className="space-y-4"
                >
                    <div className="space-y-1.5">
                        <label
                            className="text-sm font-medium"
                            htmlFor="employeeNo"
                        >
                            工号
                        </label>
                        <Input
                            id="employeeNo"
                            value={employeeNo}
                            onChange={(e) => setEmployeeNo(e.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label
                            className="text-sm font-medium"
                            htmlFor="password"
                        >
                            密码
                        </label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={pending}
                    >
                        {pending ? "登录中…" : "登录"}
                    </Button>
                </form>
            </div>
        </div>
    )
}
