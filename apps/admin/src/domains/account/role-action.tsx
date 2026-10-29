import { message } from "#/locales/message"
import { useState } from "react"
import type { StaffItem } from "@shop/api/sdk"
import { StaffAdminControllerApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@shop/ui-web"
import { STAFF_ROLE_ITEMS, type StaffRole } from "./constants"
import { accountKeys } from "./queries"
import { staffRoleLabel, staffRoleOf } from "./staff-form"
import { useT } from "#/locales/use-t"
import { useMe } from "#/shared/lib/me"

/** 调岗：改的是 `PUT /api/admin/staff/{id}/role`；自己改自己会在后端被拒，入口直接锁死 */
export function StaffRoleAction({ staff }: { staff: StaffItem }) {
    const t = useT()
    const { data: me } = useMe()
    const currentRole = staffRoleOf(staff.role)
    const [open, setOpen] = useState(false)
    const [role, setRole] = useState<StaffRole>(currentRole ?? "OPS")

    const update = useMutation({
        mutationFn: () =>
            StaffAdminControllerApi.updateRole({
                path: { id: staff.id },
                body: { role },
            }),
        meta: {
            success: message("account.role.updated"),
            error: message("account.role.failed"),
            invalidates: [accountKeys.staff.all],
        },
        onSuccess: () => setOpen(false),
    })

    if (me?.id === staff.id) {
        return <span className="text-muted-foreground">{t("account.role.selfLocked")}</span>
    }
    if (!currentRole) {
        return <span className="text-muted-foreground">{t("account.role.none")}</span>
    }

    const summaryParams = {
        loginName: staff.loginName,
        from: staffRoleLabel(currentRole, t),
        to: staffRoleLabel(role, t),
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => {
                    setRole(currentRole)
                    setOpen(true)
                }}
            >
                {t("account.role.action")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>{t("account.role.dialogTitle")}</DialogTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {staff.displayName
                            ? t("account.role.summaryNamed", {
                                  ...summaryParams,
                                  name: staff.displayName,
                              })
                            : t("account.role.summary", summaryParams)}
                    </p>
                    <div className="mt-4 flex flex-col gap-4">
                        <Select
                            value={role}
                            onValueChange={(value) => {
                                const next = staffRoleOf(value)
                                if (next) setRole(next)
                            }}
                        >
                            <SelectTrigger aria-label={t("account.role.targetLabel")}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STAFF_ROLE_ITEMS.map((item) => (
                                    <SelectItem
                                        key={item.value}
                                        value={item.value}
                                    >
                                        {t(item.labelKey)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                {t("common.action.cancel")}
                            </Button>
                            <Button
                                disabled={update.isPending || role === currentRole}
                                onClick={() => update.mutate()}
                            >
                                {update.isPending
                                    ? t("account.role.submitting")
                                    : t("account.role.submit")}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
