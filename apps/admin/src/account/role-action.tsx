import { message } from "#/locales/message"
import { useState } from "react"
import { AdminAccountApi, StaffRole, type AdminStaffItem } from "@shop/api/sdk"
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
import { STAFF_ROLE_ITEMS } from "./constants"
import { accountKeys } from "./queries"
import { staffRoleLabel, staffRoleOf } from "./staff-form"
import { useT } from "#/locales/use-t"
import { useMe } from "#/shared/lib/me"

/**
 * 调岗位（ACC-57）。
 *
 * 改自己那一行不出按钮：后端也硬拒（自指禁令），前端不给入口是同一口径的第一次拦截——
 * 用户不会去点一个注定 400 的按钮。后端那道闸仍在（前端是体验，不是安全边界）。
 */
export function StaffRoleAction({ staff }: { staff: AdminStaffItem }) {
    const t = useT()
    const { data: me } = useMe()
    const currentRole = staffRoleOf(staff.role)
    const [open, setOpen] = useState(false)
    const [role, setRole] = useState<StaffRole>(currentRole ?? StaffRole.OPS)

    const update = useMutation({
        mutationFn: () =>
            AdminAccountApi.adminUpdateStaffRole({
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

    /** 调岗前后各取一次岗位名（同一份查表，避免两处各写一遍回退规则） */
    const summaryParams = {
        employeeNo: staff.employeeNo,
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
