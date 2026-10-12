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

/**
 * 创建平台员工（ACC-57）。
 *
 * 岗位是必选而不是「默认运营」：创建时就想清楚「这个人要干什么」比事后调岗安全
 * ——调岗有「不能改自己」与「末位超管不可降级」两道禁令，是个需要解释的动作；
 * 创建时选错只是多招一个人。末位超管的保护因此只落在调岗位与禁用上。
 *
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，每次打开都是空白表单。
 * 壳只持开合，mutation 与表单实例都在 StaffForm 内——**取消掉的那次输入不该跟着进下一个人**。
 * 此前实例建在本组件（弹窗之外），只靠成功后 `form.reset()` 兜，漏了取消/点遮罩/ESC 三条退出路径。
 */
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
        // 关窗即卸载、卸载即重置：不需要（也不该）再写 form.reset()
        onSuccess: () => onOpenChange(false),
    })

    const form = useAppForm({
        defaultValues: { employeeNo: "", password: "", displayName: "", role: "OPS" as StaffRole },
        validators: { onSubmit: CreateStaffSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(value)
            } catch (error) {
                // 后端 422 的字段级明细落到对应输入框：CreateStaffRequest 的四个组件名与表单字段
                // 全部同名（工号的形状、口令的 8~72 档、姓名上限、岗位缺省），逐个列出等于「确认过同名」。
                // toast 仍由 mutation 的 meta.error 发，两条通道各说各的粒度
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        employeeNo: "employeeNo",
                        password: "password",
                        displayName: "displayName",
                        role: "role",
                    }),
                )
                // 原样抛出：form-core 才知道这次没成（见 submitForm 的注释）
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
                    // rethrow 的那条由 submitForm 接住（接口错误静默，toast 已经由 meta 发过）
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
