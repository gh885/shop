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

export function ReviewActions({ item }: { item: ShopReviewItem }) {
    const t = useT()
    const [rejectOpen, setRejectOpen] = useState(false)

    const approve = useMutation({
        mutationFn: () => AdminReviewsApi.approveShopReview({ path: { id: item.id } }),
        meta: {
            success: message("shopReview.approve.done", { shopName: item.shopName }),
            error: message("shopReview.failed"),
            invalidates: [reviewKeys.all],
        },
    })
    const reject = useMutation({
        mutationFn: (reason: string) =>
            AdminReviewsApi.rejectShopReview({ path: { id: item.id }, body: { reason } }),
        meta: {
            success: message("shopReview.reject.done", { shopName: item.shopName }),
            error: message("shopReview.failed"),
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => setRejectOpen(false),
    })

    // 通过/驳回互斥：busy 取两者之或，各按各的 isPending 会放过两个同时落库（后写覆盖）
    const busy = approve.isPending || reject.isPending

    function confirmApprove() {
        void confirm({
            title: t("shopReview.approve.title", { name: item.shopName }),
            description: t("shopReview.approve.description"),
            confirmText: t("shopReview.approve.confirm"),
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
                {t("shopReview.approve.action")}
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
                    {t("shopReview.reject.action")}
                </Button>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t("shopReview.reject.title", { name: item.shopName })}
                        </DialogTitle>
                        <DialogDescription>{t("shopReview.reject.description")}</DialogDescription>
                    </DialogHeader>
                    {/* 表单留在 DialogContent 内：BaseUI 关闭即卸载，重开才是空白，别提出来 */}
                    <ReasonForm
                        pending={reject.isPending}
                        label={t("shopReview.reject.reasonLabel")}
                        placeholder={t("shopReview.reject.reasonPlaceholder")}
                        submitLabel={t("shopReview.reject.submit")}
                        onCancel={() => setRejectOpen(false)}
                        onSubmit={(reason) => reject.mutate(reason)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
