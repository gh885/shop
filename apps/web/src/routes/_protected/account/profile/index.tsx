import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { useMe } from "#/account"
import { ME_QUERY_KEY } from "#/account/queries"
import { AuthApi } from "@shop/api/sdk"
import { Button, Card, CardContent, Separator, Skeleton, Spinner, useAppForm } from "@shop/ui-web"

export const Route = createFileRoute("/_protected/account/profile/")({
    component: ProfilePage,
    head: () => ({
        meta: [{ title: "个人资料 - 个人中心 - Shop" }],
    }),
})

/** 个人资料：展示手机号（脱敏）+ 昵称可改。头像上传本期未做，不在此。 */
function ProfilePage() {
    const { data: me, isLoading } = useMe()

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">个人资料</h2>

            {isLoading || !me ? (
                <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </>
            ) : (
                // 数据到达后才挂载表单：昵称初值直接取 me，不需要 effect 二次灌值
                <ProfileForm me={me} />
            )}
        </div>
    )
}

function ProfileForm({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
    const update = useMutation({
        mutationFn: (name: string) => AuthApi.updateProfile({ body: { nickname: name } }),
        meta: { success: "资料已更新", error: "更新失败", invalidates: [ME_QUERY_KEY] },
    })

    const form = useAppForm({
        defaultValues: { nickname: me.nickname ?? "" },
        validators: {
            onSubmit: ({ value }) =>
                value.nickname.trim().length === 0
                    ? { fields: { nickname: "昵称不能为空" } }
                    : undefined,
        },
        onSubmit: ({ value }) => update.mutate(value.nickname.trim()),
    })

    const displayName = me.nickname ?? undefined

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
                        <p className="text-sm text-muted-foreground">{me.phone}</p>
                    </div>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="text-base font-semibold">昵称</h3>
                    <form
                        className="max-w-md space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void form.handleSubmit()
                        }}
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
                            {update.isPending && <Spinner />}保存
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
