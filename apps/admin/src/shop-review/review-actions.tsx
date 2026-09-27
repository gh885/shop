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
import { ReasonForm } from "@shop/app-kit"
import { reviewKeys } from "./queries"

/**
 * 一行审核记录的操作：通过（二次确认）/ 驳回（填理由）。
 *
 * 两个写操作各自 `useMutation` + `meta`，反馈与失效交给全局 MutationCache；
 * 审核完要整棵树失效（换 status 也是同一份列表的切片），所以 `invalidates` 传 `reviewKeys.all`。
 */
export function ReviewActions({ item }: { item: ShopReviewItem }) {
    const [rejectOpen, setRejectOpen] = useState(false)

    const approve = useMutation({
        mutationFn: () => AdminReviewsApi.approveShopReview({ path: { id: item.id } }),
        meta: {
            success: `已通过「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
    })
    const reject = useMutation({
        mutationFn: (reason: string) =>
            AdminReviewsApi.rejectShopReview({ path: { id: item.id }, body: { reason } }),
        meta: {
            success: `已驳回「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => setRejectOpen(false),
    })

    // 两个决定互斥：处理中把另一颗也按住，否则「通过」和「驳回」同时落库，后写的理由覆盖了前一个结论
    const busy = approve.isPending || reject.isPending

    /** 通过二次确认：确认即审核通过，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmApprove() {
        void confirm({
            title: `通过「${item.shopName}」的开店申请`,
            description: "通过后店铺即可上架商品，确认执行？",
            confirmText: "确认通过",
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
                {approve.isPending && <Spinner />}通过
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
                    {reject.isPending && <Spinner />}驳回
                </Button>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>驳回「{item.shopName}」的开店申请</DialogTitle>
                        <DialogDescription>
                            驳回理由会通知申请人，请填写具体原因。
                        </DialogDescription>
                    </DialogHeader>
                    {/* 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，重开即空白 */}
                    <ReasonForm
                        pending={reject.isPending}
                        label="驳回理由"
                        placeholder="例如：营业执照信息与店铺主体不一致"
                        submitLabel="确认驳回"
                        onCancel={() => setRejectOpen(false)}
                        onSubmit={(reason) => reject.mutate(reason)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
