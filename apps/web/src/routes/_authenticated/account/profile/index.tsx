import { message } from "#/locales/message"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"

import { toApiError, VALIDATION_RULES } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { NICKNAME_MAX } from "@shop/app-kit/auth"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useMe } from "#/domains/account"
import { ME_QUERY_KEY } from "#/domains/account/queries"
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

export const Route = createFileRoute("/_authenticated/account/profile/")({
    component: ProfilePage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.profile", match.context.locale) }],
    }),
})

function ProfilePage() {
    const { locale } = useI18n()
    const { data: me, isLoading, isError, error, isFetching, refetch } = useMe()
    const t = useT()

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.profile")}</h2>

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
                value.nickname.trim().length === 0
                    ? { fields: { nickname: { message: VALIDATION_RULES.REQUIRED } } }
                    : undefined,
        },
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
