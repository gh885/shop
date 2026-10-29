import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { useT } from "#/locales/use-t"

import { message } from "#/locales/message"
import type { StaffItem } from "@shop/api/sdk"
import type { BuyerRow } from "./columns"
import { accountKeys } from "./queries"
import { AdminBuyerControllerApi, StaffAdminControllerApi } from "@shop/api/sdk"

/** 买家封禁 / 解封：状态值是 `active` / `disabled` */
export function AccountStatusAction({ item }: { item: BuyerRow }) {
    const t = useT()
    const current = item.status === "disabled" ? "disabled" : "active"
    const next = current === "active" ? "disabled" : "active"
    const mutation = useMutation({
        mutationFn: () =>
            AdminBuyerControllerApi.updateBuyerStatus({
                path: { buyerId: item.buyerId },
                body: { status: next },
            }),
        meta: { invalidates: [accountKeys.users.all] },
    })

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={async () => {
                const ok = await confirm({
                    title: t(
                        next === "active"
                            ? "account.statusAction.enableTitle"
                            : "account.statusAction.disableTitle",
                    ),
                    description: t(
                        next === "active"
                            ? "account.statusAction.enableConfirm"
                            : "account.statusAction.disableConfirm",
                        { target: item.phone },
                    ),
                    action: () => mutation.mutateAsync(),
                })
                void ok
            }}
        >
            {t(next === "active" ? "account.statusAction.enable" : "account.statusAction.disable")}
        </Button>
    )
}

/** 员工禁用 / 解禁：端点与买家分开（`PATCH /api/admin/staff/{id}/status`），状态值同落小写 */
export function StaffStatusAction({ staff }: { staff: StaffItem }) {
    const t = useT()
    const next = staff.status === "disabled" ? "active" : "disabled"
    const mutation = useMutation({
        mutationFn: () =>
            StaffAdminControllerApi.updateStaffStatus({
                path: { id: staff.id },
                body: { status: next },
            }),
        meta: {
            success: message("account.statusUpdate.done"),
            error: message("account.statusUpdate.failed"),
            invalidates: [accountKeys.staff.all],
        },
    })

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={async () => {
                const ok = await confirm({
                    title: t(
                        next === "active"
                            ? "account.statusAction.enableTitle"
                            : "account.statusAction.disableTitle",
                    ),
                    description: t(
                        next === "active"
                            ? "account.statusAction.enableConfirm"
                            : "account.statusAction.disableConfirm",
                        { target: staff.loginName },
                    ),
                    action: () => mutation.mutateAsync(),
                })
                void ok
            }}
        >
            {t(next === "active" ? "account.statusAction.enable" : "account.statusAction.disable")}
        </Button>
    )
}
