import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@shop/ui-web"
import { useT } from "#/locales/use-t"

export interface CancelOrderDialogProps {
    order?: { id: string; orderNo: string }
    onOpenChange: (open: boolean) => void
    pending: boolean
    onConfirm: () => Promise<void>
}

/**
 * 取消订单确认。
 *
 * <p>新契约的取消接口不收入参（`POST /buyer/orders/{orderGroupId}/cancel` 无 body），
 * 所以这里只做一次确认，不再收集取消原因——收了也传不出去。
 */
export function CancelOrderDialog({
    order,
    onOpenChange,
    pending,
    onConfirm,
}: CancelOrderDialogProps) {
    const t = useT()
    return (
        <Dialog
            open={order !== undefined}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("order.action.cancel")}</DialogTitle>
                    <DialogDescription>
                        {t("order.cancel.description", { orderNo: order?.orderNo ?? "" })}
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex justify-end gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {t("order.cancel.dismissLabel")}
                    </Button>
                    <Button
                        disabled={pending}
                        onClick={() => void onConfirm()}
                    >
                        {t("order.cancel.submitLabel")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
