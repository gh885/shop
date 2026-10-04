import { AdminAccountApi, type AdminStaffItem, type AdminUserItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { accountKeys } from "./queries"

type AccountStatusActionProps =
    | { kind: "user"; item: AdminUserItem }
    | { kind: "staff"; item: AdminStaffItem }

export function AccountStatusAction({ kind, item }: AccountStatusActionProps) {
    const mutation = useMutation({
        mutationFn: async (status: "ACTIVE" | "DISABLED") => {
            if (kind === "user") {
                await AdminAccountApi.adminUpdateUserStatus({
                    path: { id: item.id },
                    body: { status },
                })
            } else {
                await AdminAccountApi.adminUpdateStaffStatus({
                    path: { id: item.id },
                    body: { status },
                })
            }
        },
        meta: {
            success: { key: "admin.account.statusUpdate.done" },
            error: { key: "admin.account.statusUpdate.failed" },
            invalidates: [kind === "user" ? accountKeys.users.all : accountKeys.staff.all],
        },
    })
    const disabled = item.status === "DISABLED"
    const label = disabled ? "启用" : "禁用"

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
                void confirm({
                    title: `${label}账号`,
                    description: `确认${label} ${kind === "user" ? item.phone : item.employeeNo}？`,
                    confirmText: label,
                    action: () => mutation.mutateAsync(disabled ? "ACTIVE" : "DISABLED"),
                })
            }}
        >
            {label}
        </Button>
    )
}
