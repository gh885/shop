import { AdminCouponsApi, type AdminCouponItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { couponOpsKeys } from "./queries"

export function CouponVoidAction({ coupon }: { coupon: AdminCouponItem }) {
    const mutation = useMutation({
        mutationFn: () => AdminCouponsApi.voidUserCoupon({ path: { id: coupon.id } }),
        meta: {
            success: { key: "admin.coupon.ops.void.done" },
            error: { key: "admin.coupon.ops.void.failed" },
            invalidates: [couponOpsKeys.all],
        },
    })

    if (coupon.status !== "UNUSED") return <span className="text-muted-foreground">不可作废</span>

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() =>
                void confirm({
                    title: "作废优惠券",
                    description: `确认作废「${coupon.name}」？作废后不可恢复。`,
                    confirmText: "作废",
                    action: mutation.mutateAsync,
                })
            }
        >
            作废
        </Button>
    )
}
