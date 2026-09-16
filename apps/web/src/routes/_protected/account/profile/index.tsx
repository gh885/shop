import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { useMe } from "#/account"
import { ME_QUERY_KEY } from "#/account/queries"
import { useQueryClient } from "@tanstack/react-query"
import { AuthApi } from "@shop/api/sdk"
import { useWriteMutation } from "@shop/app-kit"
import { Button, Card, CardContent, Separator, Skeleton, Spinner, useAppForm } from "@shop/ui-web"

export const Route = createFileRoute("/_protected/account/profile/")({
    component: ProfilePage,
    head: () => ({
        meta: [{ title: "个人资料 - 个人中心 - Shop" }],
    }),
})

/** 个人资料：展示手机号（脱敏）+ 昵称可改。头像上传本期未做，不在此。 */
function ProfilePage() {
    const qc = useQueryClient()
    const { data: me, isLoading } = useMe()

    const update = useWriteMutation<string>({
        mutationFn: (name) => AuthApi.updateProfile({ body: { nickname: name } }),
        invalidate: () => void qc.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        messages: { success: "资料已更新", error: "更新失败" },
    })

    const form = useAppForm({
        defaultValues: { nickname: me?.nickname ?? "" },
        validators: {
            onSubmit: ({ value }) =>
                value.nickname.trim().length === 0
                    ? { fields: { nickname: "昵称不能为空" } }
                    : undefined,
        },
        onSubmit: ({ value }) => update.mutate(value.nickname.trim()),
    })

    // me 数据到达后把昵称预填进表单（用户可直接改）
    useEffect(() => {
        if (me?.nickname) form.setFieldValue("nickname", me.nickname)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.nickname])

    if (isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        )
    }

    const displayName = me?.nickname ?? undefined

    return (
        <Card>
            <CardContent className="space-y-5">
                {/* 头像占位：本期未做上传，展示昵称首字母 */}
                <div className="flex items-center gap-4">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                        {(displayName || "店")[0]}
                    </div>
                    <div>
                        <p className="text-lg font-semibold">{displayName ?? "未设置昵称"}</p>
                        <p className="text-sm text-muted-foreground">{me?.phone}</p>
                    </div>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h2 className="text-base font-semibold">昵称</h2>
                    {/* React 19 form action：React 自动接管提交（无需 preventDefault），校验仍走 TanStack Form */}
                    <form
                        className="max-w-md space-y-3"
                        action={() => void form.handleSubmit()}
                    >
                        <form.AppField name="nickname">
                            {(field) => (
                                <field.TextField
                                    label="昵称"
                                    placeholder="请输入昵称"
                                    maxLength={30}
                                />
                            )}
                        </form.AppField>
                        <Button
                            type="submit"
                            disabled={update.isPending}
                            className="w-28"
                        >
                            {update.isPending ? <Spinner /> : "保存"}
                        </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                        昵称仅用于展示，不超过 30 字。头像上传功能即将上线。
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
