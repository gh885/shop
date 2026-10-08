import { message } from "#/locales/message"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"

import { toApiError, VALIDATION_RULES } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { NICKNAME_MAX } from "@shop/app-kit/auth"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useMe } from "#/account"
import { ME_QUERY_KEY } from "#/account/queries"
import { useT } from "#/locales/use-t"
import { AuthApi } from "@shop/api/sdk"
import {
    Button,
    Card,
    CardContent,
    Separator,
    Skeleton,
    Spinner,
    StateError,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

export const Route = createFileRoute("/_protected/account/profile/")({
    component: ProfilePage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.profile", match.context.locale) }],
    }),
})

/** 个人资料：展示手机号（脱敏）+ 昵称可改。头像上传本期未做，不在此。 */
function ProfilePage() {
    const { locale } = useI18n()
    const { data: me, isLoading, isError, error, isFetching, refetch } = useMe()
    const t = useT()

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.profile")}</h2>

            {/* 三态必须分清：me 失败时 data 恒为 undefined，而 useMe 退出全局默认不抛，
                若只判`!me` 会把失败也当成「还在加载」→ 永久骨架（无错误、无重试出口）。
                资料页里 me 就是页面主体数据，失败要在本页说清楚并给重试。 */}
            {isLoading || !me ? (
                isError ? (
                    <StateError
                        message={errorText(
                            toApiError(error),
                            locale,
                            t("common.loadFailed.profile"),
                        )}
                        onRetry={() => void refetch()}
                        retrying={isFetching}
                    />
                ) : (
                    <>
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </>
                )
            ) : (
                // 数据到达后才挂载表单：昵称初值直接取 me，不需要 effect 二次灌值
                <ProfileForm me={me} />
            )}
        </div>
    )
}

function ProfileForm({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
    const t = useT()
    const update = useMutation({
        mutationFn: (name: string) => AuthApi.updateProfile({ body: { nickname: name } }),
        meta: {
            success: message("account.profile.toast.updated"),
            error: message("account.profile.toast.updateFailed"),
            invalidates: [ME_QUERY_KEY],
        },
    })

    const form = useAppForm({
        defaultValues: { nickname: me.nickname ?? "" },
        validators: {
            onSubmit: ({ value }) =>
                // 必填事实走 catalog key：与后端 `@NotBlank` 经 422 出的是同一句话（§6.1）
                value.nickname.trim().length === 0
                    ? { fields: { nickname: { message: VALIDATION_RULES.REQUIRED } } }
                    : undefined,
        },
        // mutateAsync + 就地 catch：失败时把后端 422 的字段级明细（昵称超长/违禁）落到昵称框上，
        // 再原样抛出交给 submitForm 兜住；全局 toast 仍由 mutation 的 meta.error 发（不加 silentError）
        onSubmit: async ({ value }) => {
            try {
                await update.mutateAsync(value.nickname.trim())
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { nickname: "nickname" }))
                throw error
            }
        },
    })

    const displayName = me.nickname ?? undefined

    return (
        <Card>
            <CardContent className="space-y-5">
                {/* 头像占位：本期未做上传，展示昵称首字母 */}
                <div className="flex items-center gap-4">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                        {displayName ? displayName[0] : t("account.profile.avatarFallback")}
                    </div>
                    <div>
                        <p className="text-lg font-semibold">
                            {displayName ?? t("account.profile.nicknameUnset")}
                        </p>
                        <p className="text-sm text-muted-foreground">{me.phone}</p>
                    </div>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="text-base font-semibold">{t("account.profile.nickname")}</h3>
                    <form
                        className="max-w-md space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submitForm(form)
                        }}
                    >
                        <form.AppField name="nickname">
                            {(field) => (
                                <field.TextField
                                    label={t("account.profile.nickname")}
                                    placeholder={t("account.profile.nicknamePlaceholder")}
                                    maxLength={NICKNAME_MAX}
                                />
                            )}
                        </form.AppField>
                        <Button
                            type="submit"
                            disabled={update.isPending}
                            className="w-28"
                        >
                            {update.isPending && <Spinner />}
                            {t("account.profile.save")}
                        </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                        {t("account.profile.note", { max: NICKNAME_MAX })}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
