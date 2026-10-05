import { message } from "#/locales/message"
import { AdminCouponsApi, type AdminCouponItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { couponOpsKeys } from "./queries"

export function CouponVoidAction({ coupon }: { coupon: AdminCouponItem }) {
    const t = useT()
    const mutation = useMutation({
        mutationFn: () => AdminCouponsApi.voidUserCoupon({ path: { id: coupon.id } }),
        meta: {
            success: message("admin.coupon.ops.void.done"),
            error: message("admin.coupon.ops.void.failed"),
            invalidates: [couponOpsKeys.all],
        },
    })

    if (coupon.status !== "UNUSED") {
        return <span className="text-muted-foreground">{t("admin.coupon.ops.void.blocked")}</span>
    }

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() =>
                void confirm({
                    title: t("admin.coupon.ops.void.dialogTitle"),
                    description: t("admin.coupon.ops.void.confirm", { name: coupon.name }),
                    confirmText: t("admin.coupon.ops.void.action"),
                    action: mutation.mutateAsync,
                })
            }
        >
            {t("admin.coupon.ops.void.action")}
        </Button>
    )
}
