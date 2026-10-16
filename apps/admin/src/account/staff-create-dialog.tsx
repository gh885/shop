import { message } from "#/locales/message"
import { useState } from "react"
import { AdminAccountApi, type StaffRole } from "@shop/api/sdk"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { usePasswordVisibility } from "@shop/app-kit/auth"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    PasswordToggle,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { accountKeys } from "./queries"
import {
    CreateStaffSchema,
    DISPLAY_NAME_MAX,
    EMPLOYEE_NO_MAX,
    type CreateStaffValue,
} from "./staff-form"
import { STAFF_ROLE_ITEMS } from "./constants"
import { useT } from "#/locales/use-t"

export function StaffCreateDialog() {
    const t = useT()
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button
                size="sm"
                onClick={() => setOpen(true)}
            >
                {t("account.staff.create")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <StaffForm onOpenChange={setOpen} />
                </DialogContent>
            </Dialog>
        </>
    )
}

function StaffForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const t = useT()
    const password = usePasswordVisibility()

    const create = useMutation({
        mutationFn: (value: CreateStaffValue) =>
            AdminAccountApi.adminCreateStaff({
                body: {
                    employeeNo: value.employeeNo,
                    password: value.password,
                    displayName: value.displayName || undefined,
                    role: value.role,
                },
            }),
        meta: {
            success: message("account.staff.created"),
            error: message("account.staff.failed"),
            invalidates: [accountKeys.staff.all],
        },
        onSuccess: () => onOpenChange(false),
    })

    const form = useAppForm({
        defaultValues: { employeeNo: "", password: "", displayName: "", role: "OPS" as StaffRole },
        validators: { onSubmit: CreateStaffSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(value)
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        employeeNo: "employeeNo",
                        password: "password",
                        displayName: "displayName",
                        role: "role",
                    }),
                )
                // 原样抛出：吞掉的话 form-core 会以为这次提交成功
                throw error
            }
        },
    })

    return (
        <>
            <DialogTitle>{t("account.staff.dialogTitle")}</DialogTitle>
            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault()
                    void submitForm(form)
                }}
            >
                <form.AppField name="employeeNo">
                    {(field) => (
                        <field.TextField
                            label={t("account.staff.employeeNo")}
                            required
                            maxLength={EMPLOYEE_NO_MAX}
                            placeholder={t("account.staff.employeeNoPlaceholder")}
                        />
                    )}
                </form.AppField>
                <form.AppField name="displayName">
                    {(field) => (
                        <field.TextField
                            label={t("account.staff.displayName")}
                            maxLength={DISPLAY_NAME_MAX}
                            placeholder={t("account.staff.displayNamePlaceholder")}
                        />
                    )}
                </form.AppField>
                <form.AppField name="password">
                    {(field) => (
                        <field.TextField
                            label={t("account.staff.password")}
                            required
                            type={password.inputType}
                            autoComplete="new-password"
                            placeholder={t("account.staff.passwordPlaceholder")}
                            className="pr-10"
                            trailing={<PasswordToggle {...password.toggleProps} />}
                        />
                    )}
                </form.AppField>
                <form.AppField name="role">
                    {(field) => (
                        <field.SelectField
                            label={t("account.staff.role")}
                            items={STAFF_ROLE_ITEMS.map((item) => ({
                                value: item.value,
                                label: t(item.labelKey),
                            }))}
                        />
                    )}
                </form.AppField>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {t("common.action.cancel")}
                    </Button>
                    <Button
                        type="submit"
                        disabled={create.isPending}
                    >
                        {create.isPending && <Spinner />}
                        {t("account.staff.submit")}
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}
