import { message } from "#/locales/message"
import { useState } from "react"
import { AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    confirm,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Spinner,
} from "@shop/ui-web"
import { ReasonForm } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import { reviewKeys } from "./queries"

/**
 * 一行审核记录的操作：通过（二次确认）/ 驳回（填理由）。
 *
 * 两个写操作各自 `useMutation` + `meta`，反馈与失效交给全局 MutationCache；
 * 审核完要整棵树失效（换 status 也是同一份列表的切片），所以 `invalidates` 传 `reviewKeys.all`。
 */
export function ReviewActions({ item }: { item: ShopReviewItem }) {
    const t = useT()
    const [rejectOpen, setRejectOpen] = useState(false)

    const approve = useMutation({
        mutationFn: () => AdminReviewsApi.approveShopReview({ path: { id: item.id } }),
        meta: {
            success: message("admin.shopReview.approve.done", { shopName: item.shopName }),
            error: message("admin.shopReview.failed"),
            invalidates: [reviewKeys.all],
        },
    })
    const reject = useMutation({
        mutationFn: (reason: string) =>
            AdminReviewsApi.rejectShopReview({ path: { id: item.id }, body: { reason } }),
        meta: {
            success: message("admin.shopReview.reject.done", { shopName: item.shopName }),
            error: message("admin.shopReview.failed"),
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => setRejectOpen(false),
    })

    // 两个决定互斥：处理中把另一颗也按住，否则「通过」和「驳回」同时落库，后写的理由覆盖了前一个结论
    const busy = approve.isPending || reject.isPending

    /** 通过二次确认：确认即审核通过，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmApprove() {
        void confirm({
            title: t("admin.shopReview.approve.title", { name: item.shopName }),
            description: t("admin.shopReview.approve.description"),
            confirmText: t("admin.shopReview.approve.confirm"),
            action: () => approve.mutateAsync(),
        })
    }

    return (
        <div className="flex justify-end gap-1">
            <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={confirmApprove}
            >
                {approve.isPending && <Spinner />}
                {t("admin.shopReview.approve.action")}
            </Button>
            <Dialog
                open={rejectOpen}
                onOpenChange={setRejectOpen}
            >
                <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => setRejectOpen(true)}
                >
                    {reject.isPending && <Spinner />}
                    {t("admin.shopReview.reject.action")}
                </Button>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t("admin.shopReview.reject.title", { name: item.shopName })}
                        </DialogTitle>
                        <DialogDescription>
                            {t("admin.shopReview.reject.description")}
                        </DialogDescription>
                    </DialogHeader>
                    {/* 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，重开即空白 */}
                    <ReasonForm
                        pending={reject.isPending}
                        label={t("admin.shopReview.reject.reasonLabel")}
                        placeholder={t("admin.shopReview.reject.reasonPlaceholder")}
                        submitLabel={t("admin.shopReview.reject.submit")}
                        onCancel={() => setRejectOpen(false)}
                        onSubmit={(reason) => reject.mutate(reason)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
