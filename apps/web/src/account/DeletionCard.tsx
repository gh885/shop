import { useState } from "react"

import { formatDateTime, useI18n } from "@shop/app-kit"
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
    const [dialogOpen, setDialogOpen] = useState(false)
    const status = useQuery(deletionStatusOptions())

    const cancel = useMutation({
        mutationFn: () => AccountDeletionApi.cancelDeletion(),
        meta: { success: "已撤销注销申请", error: "撤销失败", invalidates: [deletionKeys.all] },
    })

    const requested = status.data?.requested === true

    return (
        <Card>
            <CardHeader>
                <CardTitle>注销账号</CardTitle>
                <CardDescription>
                    {requested
                        ? "注销申请已提交，冷静期满后将无法恢复。"
                        : "注销不可逆：账号将无法登录，个人数据按下述清单处置。"}
                </CardDescription>
                <CardAction>
                    {requested ? (
                        <Button
                            variant="outline"
                            disabled={cancel.isPending}
                            onClick={() => {
                                void confirm({
                                    title: "撤销注销申请",
                                    description: "账号将恢复正常使用，之后可以再次申请注销。",
                                    confirmText: "撤销申请",
                                    action: () => cancel.mutateAsync(),
                                })
                            }}
                        >
                            {cancel.isPending ? <Spinner /> : "撤销注销申请"}
                        </Button>
                    ) : (
                        <Button
                            variant="destructive"
                            onClick={() => setDialogOpen(true)}
                        >
                            注销账号
                        </Button>
                    )}
                </CardAction>
            </CardHeader>
            <CardContent>
                {status.isLoading ? (
                    <Skeleton className="h-5 w-full max-w-md" />
                ) : requested ? (
                    <p className="text-sm text-muted-foreground">
                        {status.data?.effectiveAt ? (
                            <>
                                预计{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                    {formatDateTime(status.data.effectiveAt, locale)}
                                </span>{" "}
                            </>
                        ) : (
                            "冷静期满时"
                        )}
                        生效，在此之前随时可以撤销。
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        提交后进入冷静期，期内账号照常可用、随时可以撤销；期满才执行，届时无法恢复。
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
