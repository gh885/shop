import { message } from "#/locales/message"
import { useState } from "react"

import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { AccountDeletionApi } from "@shop/api/sdk"
import {
    Button,
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    confirm,
    Skeleton,
    Spinner,
} from "@shop/ui-web"
import { useMutation, useQuery } from "@tanstack/react-query"

import { useT } from "#/locales/use-t"
import { DeletionDialog } from "./DeletionDialog"
import { deletionKeys, deletionStatusOptions } from "./queries"

/**
 * 注销账号卡（安全设置页尾）：两种形态是同一件事的前后两格 ——
 * 没申请时给毁灭性入口（点开弹窗看清单），已在冷静期时只给「哪一刻生效 + 撤销」。
 *
 * 生效时刻读接口给的 `effectiveAt`，前端不自己按天数加：冷静期长度是后端的常量（ACC-75），
 * 这里复述一遍才不会两边各算一处、改一边忘一边。
 */
export function DeletionCard() {
    const { locale } = useI18n()
    const t = useT()
    const [dialogOpen, setDialogOpen] = useState(false)
    const status = useQuery(deletionStatusOptions())

    const cancel = useMutation({
        mutationFn: () => AccountDeletionApi.cancelDeletion(),
        meta: {
            success: message("account.deletion.toast.cancelled"),
            error: message("account.deletion.toast.cancelFailed"),
            invalidates: [deletionKeys.all],
        },
    })

    const requested = status.data?.requested === true

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("account.deletion.title")}</CardTitle>
                <CardDescription>
                    {requested
                        ? t("account.deletion.card.descriptionRequested")
                        : t("account.deletion.card.descriptionIdle")}
                </CardDescription>
                <CardAction>
                    {requested ? (
                        <Button
                            variant="outline"
                            disabled={cancel.isPending}
                            onClick={() => {
                                void confirm({
                                    title: t("account.deletion.cancel.confirmTitle"),
                                    description: t("account.deletion.cancel.confirmDescription"),
                                    confirmText: t("account.deletion.cancel.confirmAction"),
                                    action: () => cancel.mutateAsync(),
                                })
                            }}
                        >
                            {cancel.isPending ? <Spinner /> : t("account.deletion.cancel.action")}
                        </Button>
                    ) : (
                        <Button
                            variant="destructive"
                            onClick={() => setDialogOpen(true)}
                        >
                            {t("account.deletion.title")}
                        </Button>
                    )}
                </CardAction>
            </CardHeader>
            <CardContent>
                {status.isLoading ? (
                    <Skeleton className="h-5 w-full max-w-md" />
                ) : requested ? (
                    <p className="text-sm text-muted-foreground">
                        {status.data?.effectiveAt
                            ? t("account.deletion.card.effectiveWithTime", {
                                  time: formatDateTime(status.data.effectiveAt, locale),
                              })
                            : t("account.deletion.card.effectiveWithoutTime")}
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t("account.deletion.card.pendingHint")}
                    </p>
                )}
            </CardContent>

            <DeletionDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </Card>
    )
}
