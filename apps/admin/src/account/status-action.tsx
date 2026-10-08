import { message } from "#/locales/message"
import { AdminAccountApi, type AdminStaffItem, type AdminUserItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { accountKeys } from "./queries"
import { useT } from "#/locales/use-t"

type AccountStatusActionProps =
    | { kind: "user"; item: AdminUserItem }
    | { kind: "staff"; item: AdminStaffItem }

export function AccountStatusAction({ kind, item }: AccountStatusActionProps) {
    const t = useT()
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
            success: message("account.statusUpdate.done"),
            error: message("account.statusUpdate.failed"),
            invalidates: [kind === "user" ? accountKeys.users.all : accountKeys.staff.all],
        },
    })
    const disabled = item.status === "DISABLED"
    // 按钮、确认框标题与确认句共用同一档动词：三处各写一次就会漂（「启用」配「确认禁用」）
    const verb = disabled ? t("account.statusAction.enable") : t("account.statusAction.disable")
    const target = kind === "user" ? item.phone : item.employeeNo

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
                void confirm({
                    title: disabled
                        ? t("account.statusAction.enableTitle")
                        : t("account.statusAction.disableTitle"),
                    description: disabled
                        ? t("account.statusAction.enableConfirm", { target })
                        : t("account.statusAction.disableConfirm", { target }),
                    confirmText: verb,
                    action: () => mutation.mutateAsync(disabled ? "ACTIVE" : "DISABLED"),
                })
            }}
        >
            {verb}
        </Button>
    )
}
