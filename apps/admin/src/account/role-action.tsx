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
import { useMe } from "#/shared/lib/me"

/**
 * 调岗位（ACC-57）。
 *
 * 改自己那一行不出按钮：后端也硬拒（自指禁令），前端不给入口是同一口径的第一次拦截——
 * 用户不会去点一个注定 400 的按钮。后端那道闸仍在（前端是体验，不是安全边界）。
 */
export function StaffRoleAction({ staff }: { staff: AdminStaffItem }) {
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
            success: "岗位已调整",
            error: "调整岗位失败",
            invalidates: [accountKeys.staff.all],
        },
        onSuccess: () => setOpen(false),
    })

    if (me?.id === staff.id) return <span className="text-muted-foreground">不可改自己</span>
    if (!currentRole) return <span className="text-muted-foreground">无岗位</span>

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
                调岗
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>调整岗位</DialogTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {staff.employeeNo}
                        {staff.displayName ? `（${staff.displayName}）` : ""}：
                        {staffRoleLabel(currentRole)} → {staffRoleLabel(role)}
                    </p>
                    <div className="mt-4 flex flex-col gap-4">
                        <Select
                            value={role}
                            onValueChange={(value) => {
                                const next = staffRoleOf(value)
                                if (next) setRole(next)
                            }}
                        >
                            <SelectTrigger aria-label="目标岗位">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STAFF_ROLE_ITEMS.map((item) => (
                                    <SelectItem
                                        key={item.value}
                                        value={item.value}
                                    >
                                        {item.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                disabled={update.isPending || role === currentRole}
                                onClick={() => update.mutate()}
                            >
                                {update.isPending ? "调整中…" : "确认调整"}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
